import express from 'express';
import { register, login, logout, getProfile, adminRegister } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [first_name, emailid, password, age, gender]
 *             properties:
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               emailid: { type: string, format: email }
 *               password: { type: string, format: password }
 *               age: { type: integer }
 *               gender: { type: string, enum: ['male', 'female', 'others'] }
 *               favoriteGenres: { type: array, items: { type: string } }
 *               favoriteThemes: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: User created, cookie set
 *       400:
 *         description: Validation error
 */


router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);
router.post('/admin/register', authenticate, adminRegister);
export default router;