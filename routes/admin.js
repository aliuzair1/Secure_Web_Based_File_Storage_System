const express = require('express');
const router = express.Router();
const { client } = require('../pg');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/auth');
require("dotenv").config();

// Admin middleware to check if user is admin
const adminMiddleware = async (req, res, next) => {
    try {
        if (!req.user || !req.user.is_admin) {
            return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
        }

        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Apply auth middleware to all admin routes
router.use(adminMiddleware);

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        // Get system summary
        const summaryResult = await client.query(`
            SELECT 
                COUNT(DISTINCT u.user_id) AS total_users,
                COUNT(DISTINCT f.file_id) FILTER (WHERE NOT f.is_folder) AS total_files,
                COALESCE(SUM(u.storage_used), 0) AS total_storage_used,
                COUNT(DISTINCT u.user_id) FILTER (WHERE u.plan_id = 2) AS premium_users
            FROM 
                users u
            LEFT JOIN 
                subscription_plans sp ON u.plan_id = sp.plan_id
            LEFT JOIN 
                files f ON u.user_id = f.user_id;
        `);

        const stats = summaryResult.rows[0];

        res.json({
            total_users: parseInt(stats.total_users),
            total_files: parseInt(stats.total_files),
            total_storage_used: parseInt(stats.total_storage_used) || 0,
            premium_users: parseInt(stats.premium_users) || 0
        });
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ message: 'Error getting dashboard stats' });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = `
            SELECT 
                u.user_id, u.username, u.email, u.storage_used, u.created_at, u.last_login, 
                u.is_admin, u.plan_id, sp.storage_limit, sp.plan_name,
                COUNT(f.file_id) FILTER (WHERE NOT f.is_folder) AS file_count
            FROM 
                users u
            LEFT JOIN 
                subscription_plans sp ON u.plan_id = sp.plan_id
            LEFT JOIN 
                files f ON u.user_id = f.user_id
        `;

        const params = [];

        if (search) {
            query += ` WHERE u.username ILIKE $1 OR u.email ILIKE $1`;
            params.push(`%${search}%`);
        }

        query += `
            GROUP BY u.user_id, sp.storage_limit, sp.plan_name
            ORDER BY u.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(limit, offset);

        const result = await client.query(query, params);

        // Get total count for pagination
        let countQuery = `SELECT COUNT(DISTINCT u.user_id) FROM users u`;

        if (search) {
            countQuery += ` WHERE u.username ILIKE $1 OR u.email ILIKE $1`;
        }

        const countResult = await client.query(countQuery, search ? [`%${search}%`] : []);
        const totalUsers = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalUsers / limit);

        res.json({
            users: result.rows,
            total_users: totalUsers,
            total_pages: totalPages,
            current_page: page
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ message: 'Error getting users' });
    }
});

// Get user details
router.get('/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Get user info
        const userResult = await client.query(`
            SELECT 
                u.user_id, u.username, u.email, u.storage_used, u.created_at, u.last_login, 
                u.is_admin, u.plan_id, sp.storage_limit, sp.plan_name,
                COUNT(f.file_id) FILTER (WHERE NOT f.is_folder) AS file_count
            FROM 
                users u
            LEFT JOIN 
                subscription_plans sp ON u.plan_id = sp.plan_id
            LEFT JOIN 
                files f ON u.user_id = f.user_id
            WHERE 
                u.user_id = $1
            GROUP BY 
                u.user_id, sp.storage_limit, sp.plan_name
        `, [userId]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get last session info for IP
        const sessionResult = await client.query(`
            SELECT ip_address 
            FROM user_sessions 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [userId]);

        const user = userResult.rows[0];

        if (sessionResult.rows.length > 0) {
            user.ip_address = sessionResult.rows[0].ip_address;
        }

        res.json(user);
    } catch (error) {
        console.error('Error getting user details:', error);
        res.status(500).json({ message: 'Error getting user details' });
    }
});

// Update user
router.put('/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const { plan_id, status, notes } = req.body;

        // Check if user exists
        const userCheck = await client.query(
            'SELECT * FROM users WHERE user_id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update user
        await client.query(
            'UPDATE users SET plan_id = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
            [plan_id, userId]
        );

        // Log activity
        await client.query(
            'INSERT INTO activity_logs (user_id, action_type, action_details) VALUES ($1, $2, $3)',
            [req.user.user_id, 'admin_update_user', `Admin updated user: ${userId}`]
        );

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Check if user exists
        const userCheck = await client.query(
            'SELECT * FROM users WHERE user_id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get user's files for deletion
        const filesResult = await client.query(
            'SELECT file_id, file_path FROM files WHERE user_id = $1',
            [userId]
        );

        // Delete physical files
        for (const file of filesResult.rows) {
            try {
                if (fs.existsSync(file.file_path)) {
                    fs.unlinkSync(file.file_path);
                }
            } catch (unlinkError) {
                console.error(`Failed to delete file ${file.file_path}:`, unlinkError);
                // Continue even if physical deletion fails
            }
        }

        // Delete user
        await client.query(
            'DELETE FROM users WHERE user_id = $1',
            [userId]
        );

        // Log activity
        await client.query(
            'INSERT INTO activity_logs (user_id, action_type, action_details) VALUES ($1, $2, $3)',
            [req.user.user_id, 'admin_delete_user', `Admin deleted user: ${userId}`]
        );

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error deleting user' });
    }
});

// Get all files
router.get('/files', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = `
            SELECT 
                f.file_id, f.file_name, f.file_size, f.upload_date, 
                u.username, u.user_id,
                ft.type_name, ft.extension
            FROM 
                files f
            LEFT JOIN 
                users u ON f.user_id = u.user_id
            LEFT JOIN 
                file_types ft ON f.type_id = ft.type_id
            WHERE 
                f.is_folder = false
        `;

        const params = [];

        if (search) {
            query += ` AND (f.file_name ILIKE $1 OR u.username ILIKE $1)`;
            params.push(`%${search}%`);
        }

        query += `
            ORDER BY f.upload_date DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(limit, offset);

        const result = await client.query(query, params);

        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) FROM files f WHERE f.is_folder = false`;

        if (search) {
            countQuery += ` AND (f.file_name ILIKE $1 OR f.user_id IN (SELECT user_id FROM users WHERE username ILIKE $1))`;
        }

        const countResult = await client.query(countQuery, search ? [`%${search}%`] : []);
        const totalFiles = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalFiles / limit);

        res.json({
            files: result.rows,
            total_files: totalFiles,
            total_pages: totalPages,
            current_page: page
        });
    } catch (error) {
        console.error('Error getting files:', error);
        res.status(500).json({ message: 'Error getting files' });
    }
});

// Download file
router.get('/files/:fileId/download', async (req, res) => {
    try {
        const fileId = req.params.fileId;

        const result = await client.query(
            'SELECT file_path, file_name FROM files WHERE file_id = $1',
            [fileId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = result.rows[0];

        // Check if file exists
        if (!fs.existsSync(file.file_path)) {
            return res.status(404).json({ message: 'File not found on server' });
        }

        // Log activity
        await client.query(
            'INSERT INTO activity_logs (user_id, action_type, file_id, action_details) VALUES ($1, $2, $3, $4)',
            [req.user.user_id, 'admin_download', fileId, `Admin downloaded file: ${file.file_name}`]
        );

        res.download(file.file_path, file.file_name);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ message: 'Error downloading file' });
    }
});

// Delete file
router.delete('/files/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;

        // Get file info
        const fileResult = await client.query(
            'SELECT file_path, file_name, file_size, user_id FROM files WHERE file_id = $1',
            [fileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const fileInfo = fileResult.rows[0];

        // Delete file from database
        await client.query(
            'DELETE FROM files WHERE file_id = $1',
            [fileId]
        );

        // Update user's storage usage
        await client.query(
            'UPDATE users SET storage_used = storage_used - $1 WHERE user_id = $2',
            [fileInfo.file_size, fileInfo.user_id]
        );

        // Try to delete physical file
        try {
            if (fs.existsSync(fileInfo.file_path)) {
                fs.unlinkSync(fileInfo.file_path);
            }
        } catch (unlinkError) {
            console.error('Error deleting physical file:', unlinkError);
            // Continue even if physical deletion fails
        }

        // Log activity
        await client.query(
            'INSERT INTO activity_logs (user_id, action_type, action_details) VALUES ($1, $2, $3)',
            [req.user.user_id, 'admin_delete_file', `Admin deleted file: ${fileInfo.file_name}`]
        );

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ message: 'Error deleting file' });
    }
});

module.exports = router;