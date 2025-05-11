const express = require('express');
const router = express.Router();
const { client, pool } = require('../pg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const authMiddleware = require('../middlewares/auth');
const { v4: uuidv4 } = require('uuid');
require("dotenv").config();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate a more secure unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const fileFilter = (req, file, cb) => {
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
});

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all files for the user
router.get('/', async (req, res) => {
  try {
    // Check if user is authenticated
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
    // Check if user is authenticated
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

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in upload route');
      // Delete uploaded file if it exists
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file after auth failure:', unlinkError);
        }
      }
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('Processing upload for user:', req.user.user_id);
    console.log('File details:', {
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path
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
      // Delete uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUsage = parseInt(storageResult.rows[0].storage_used) || 0;
    const storageLimit = parseInt(storageResult.rows[0].storage_limit);

    if (currentUsage + fileSize > storageLimit) {
      // Delete uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
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
      // Insert file record
      const fileResult = await client.query(
        `INSERT INTO files 
         (file_name, file_path, file_size, type_id, user_id, is_folder, upload_date)
         VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP)
         RETURNING file_id, file_name, file_size, upload_date`,
        [
          req.file.originalname,
          req.file.path,
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

      // Update user storage
      await client.query(
        'UPDATE users SET storage_used = storage_used + $1 WHERE user_id = $2',
        [fileSize, req.user.user_id]
      );

      console.log('File uploaded successfully:', fileResult.rows[0]);

      // Return file information
      res.json(fileResult.rows[0]);
    } catch (dbError) {
      console.error('Database error during file upload:', dbError);
      // If database operation fails, attempt to clean up the uploaded file
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (unlinkError) {
        console.error('Error deleting file after failed upload:', unlinkError);
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Error uploading file: ' + error.message });
  }
});

// Download file
router.get('/download/:id', async (req, res) => {
  try {
    // Check if user is authenticated
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

    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      console.error('Physical file not found:', file.file_path);
      return res.status(404).json({ message: 'File not found on server' });
    }

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

    console.log('Sending file for download:', file.file_name);
    res.download(file.file_path, file.file_name);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ message: 'Error downloading file' });
  }
});

// Delete file
router.delete('/:id', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.user_id) {
      console.error('User not authenticated in delete route');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Processing delete for file:', req.params.id);

    // First get the file to find its path
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
    const result = await client.query(
      'DELETE FROM files WHERE file_id = $1 AND user_id = $2 RETURNING file_name',
      [req.params.id, req.user.user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Update user's storage usage
    await client.query(
      'UPDATE users SET storage_used = storage_used - $1 WHERE user_id = $2',
      [fileInfo.file_size, req.user.user_id]
    );

    // Try to delete the physical file
    try {
      if (fs.existsSync(fileInfo.file_path)) {
        fs.unlinkSync(fileInfo.file_path);
        console.log('Physical file deleted:', fileInfo.file_path);
      } else {
        console.log('Physical file not found for deletion:', fileInfo.file_path);
      }
    } catch (fsError) {
      console.error('Error deleting physical file:', fsError);
      // Continue even if physical deletion fails
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
    // Check if user is authenticated
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