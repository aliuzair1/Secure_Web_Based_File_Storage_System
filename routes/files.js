const express = require('express');
const router = express.Router();
const { client } = require('../pg');
const path = require('path');
const multer = require('multer');
const authMiddleware = require('../middlewares/auth');
const { v4: uuidv4 } = require('uuid');
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multerS3 = require('multer-s3');
require("dotenv").config();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Configure multer for S3 uploads
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.S3_BUCKET_NAME,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + uuidv4();
      const extension = path.extname(file.originalname);
      cb(null, `uploads/${req.user.user_id}/${file.fieldname}-${uniqueSuffix}${extension}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all files for the user
router.get('/', async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in get files route');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Getting files for user:', req.user.user_id);

    const result = await client.query(
      `SELECT f.file_id, f.file_name, f.file_size, f.upload_date, 
       ft.type_name, ft.extension
       FROM files f
       LEFT JOIN file_types ft ON f.type_id = ft.type_id
       WHERE f.user_id = $1 AND f.is_folder = false
       ORDER BY f.upload_date DESC`,
      [req.user.user_id]
    );

    console.log(`Found ${result.rows.length} files for user ${req.user.user_id}`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Error fetching files' });
  }
});

// Get storage info
router.get('/storage-info', async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in storage-info route');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Getting storage info for user:', req.user.user_id);

    const result = await client.query(
      `SELECT u.storage_used, sp.storage_limit, u.plan_id, sp.plan_name
       FROM users u
       JOIN subscription_plans sp ON u.plan_id = sp.plan_id
       WHERE u.user_id = $1`,
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      console.log('User not found:', req.user.user_id);
      return res.status(404).json({ message: 'User not found' });
    }

    const storageInfo = result.rows[0];
    console.log('Storage info retrieved:', storageInfo);

    res.json({
      storage_used: storageInfo.storage_used || 0,
      storage_limit: storageInfo.storage_limit,
      plan_id: storageInfo.plan_id,
      plan_name: storageInfo.plan_name
    });
  } catch (error) {
    console.error('Error fetching storage info:', error);
    res.status(500).json({ message: 'Error fetching storage info' });
  }
});

// Upload file to S3
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in upload route');
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('Processing upload for user:', req.user.user_id);
    console.log('File details:', {
      originalName: req.file.originalname,
      size: req.file.size,
      key: req.file.key,
      location: req.file.location
    });

    const fileExtension = path.extname(req.file.originalname).toLowerCase().substring(1);
    const fileSize = req.file.size;

    // Check user's storage limit before saving
    const storageResult = await client.query(
      `SELECT u.storage_used, sp.storage_limit 
       FROM users u 
       JOIN subscription_plans sp ON u.plan_id = sp.plan_id 
       WHERE u.user_id = $1`,
      [req.user.user_id]
    );

    if (storageResult.rows.length === 0) {
      // Delete uploaded file from S3
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: req.file.key
      }));
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUsage = parseInt(storageResult.rows[0].storage_used) || 0;
    const storageLimit = parseInt(storageResult.rows[0].storage_limit);

    if (currentUsage + fileSize > storageLimit) {
      // Delete uploaded file from S3
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: req.file.key
      }));
      return res.status(400).json({ message: 'Storage limit exceeded' });
    }

    // Check if file type exists or create it
    let typeResult = await client.query(
      'SELECT type_id FROM file_types WHERE extension = $1',
      [fileExtension]
    );

    let typeId;
    if (typeResult.rows.length === 0) {
      const newType = await client.query(
        'INSERT INTO file_types (type_name, extension) VALUES ($1, $2) RETURNING type_id',
        [`${fileExtension.toUpperCase()} File`, fileExtension]
      );
      typeId = newType.rows[0].type_id;
    } else {
      typeId = typeResult.rows[0].type_id;
    }

    try {
      // Insert file record with S3 key as file_path
      // NOTE: Database trigger will automatically update storage_used
      const fileResult = await client.query(
        `INSERT INTO files 
         (file_name, file_path, file_size, type_id, user_id, is_folder, upload_date)
         VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP)
         RETURNING file_id, file_name, file_size, upload_date`,
        [
          req.file.originalname,
          req.file.key, // Store S3 key instead of local path
          fileSize,
          typeId,
          req.user.user_id
        ]
      );

      // Log activity
      await client.query(
        'INSERT INTO activity_logs (user_id, action_type, file_id, action_details) VALUES ($1, $2, $3, $4)',
        [req.user.user_id, 'upload', fileResult.rows[0].file_id, `Uploaded file: ${req.file.originalname}`]
      );

      // NOTE: No manual storage update needed - trigger handles it automatically

      console.log('File uploaded successfully to S3:', fileResult.rows[0]);

      res.json(fileResult.rows[0]);
    } catch (dbError) {
      console.error('Database error during file upload:', dbError);
      // Delete uploaded file from S3 if database operation fails
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: req.file.key
        }));
      } catch (deleteError) {
        console.error('Error deleting file from S3 after failed upload:', deleteError);
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Error uploading file: ' + error.message });
  }
});

// Download file from S3
router.get('/download/:id', async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in download route');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Processing download for file:', req.params.id);

    const result = await client.query(
      'SELECT file_path, file_name FROM files WHERE file_id = $1 AND user_id = $2',
      [req.params.id, req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    const file = result.rows[0];

    // Generate a pre-signed URL for downloading from S3
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: file.file_path, // file_path now contains S3 key
      ResponseContentDisposition: `attachment; filename="${file.file_name}"`
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL valid for 1 hour

    // Log activity
    await client.query(
      'INSERT INTO activity_logs (user_id, action_type, file_id, action_details) VALUES ($1, $2, $3, $4)',
      [req.user.user_id, 'download', req.params.id, `Downloaded file: ${file.file_name}`]
    );

    // Update last accessed timestamp
    await client.query(
      'UPDATE files SET last_accessed = CURRENT_TIMESTAMP WHERE file_id = $1',
      [req.params.id]
    );

    console.log('Generated download URL for:', file.file_name);
    
    // Redirect to the pre-signed URL
    res.redirect(signedUrl);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ message: 'Error downloading file' });
  }
});

// Delete file from S3
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in delete route');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Processing delete for file:', req.params.id);

    // First get the file to find its S3 key
    const fileQuery = await client.query(
      'SELECT file_path, file_name, file_size FROM files WHERE file_id = $1 AND user_id = $2',
      [req.params.id, req.user.user_id]
    );

    if (fileQuery.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    const fileInfo = fileQuery.rows[0];
    console.log('File to delete:', fileInfo);

    // Delete file from database
    // NOTE: Database trigger will automatically update storage_used
    const result = await client.query(
      'DELETE FROM files WHERE file_id = $1 AND user_id = $2 RETURNING file_name',
      [req.params.id, req.user.user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    // NOTE: No manual storage update needed - trigger handles it automatically

    // Delete the file from S3
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileInfo.file_path // file_path contains S3 key
      }));
      console.log('File deleted from S3:', fileInfo.file_path);
    } catch (s3Error) {
      console.error('Error deleting file from S3:', s3Error);
      // Continue even if S3 deletion fails
    }

    // Log activity
    await client.query(
      'INSERT INTO activity_logs (user_id, action_type, action_details) VALUES ($1, $2, $3)',
      [req.user.user_id, 'delete', `Deleted file: ${result.rows[0].file_name}`]
    );

    console.log('File deleted successfully:', req.params.id);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Error deleting file' });
  }
});

// Search files
router.get('/search', async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in search route');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ message: 'Search query required' });
    }

    console.log('Searching files for user:', req.user.user_id, 'Query:', query);

    const result = await client.query(
      `SELECT f.file_id, f.file_name, f.file_size, f.upload_date, 
       ft.type_name, ft.extension
       FROM files f
       LEFT JOIN file_types ft ON f.type_id = ft.type_id
       WHERE f.user_id = $1 AND f.is_folder = false 
       AND f.file_name ILIKE $2
       ORDER BY f.upload_date DESC`,
      [req.user.user_id, `%${query}%`]
    );

    console.log(`Found ${result.rows.length} files matching query: ${query}`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ message: 'Error searching files' });
  }
});

module.exports = router;