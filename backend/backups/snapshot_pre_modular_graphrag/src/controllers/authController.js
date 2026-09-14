import { User } from '../models/userSchema.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import redisclient from '../config/redis.js';
import { getCookieOptions, getClearCookieOptions } from '../config/cors.js';

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return process.env.JWT_SECRET;
}

export async function register(req, res) {
  try {
    const {
      first_name,
      last_name,
      name,
      emailid,
      email,
      password,
      age,
      gender,
      favoriteGenres = [],
      favoriteThemes = []
    } = req.body;

    const normalizedEmail = (emailid || email || '').trim().toLowerCase();
    const [derivedFirstName, ...derivedLastNameParts] = (name || '').trim().split(/\s+/);
    const firstName = first_name || derivedFirstName;
    const lastName = last_name || derivedLastNameParts.join(' ');

    if (!firstName || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user already exists
    const existing = await User.findOne({ emailid: normalizedEmail });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    // Hash password (the schema's pre-save hook will do it, but we do explicitly to be safe)
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      first_name: firstName,
      last_name: lastName,
      emailid: normalizedEmail,
      password: hashedPassword,
      age: age || 18,
      gender: gender || 'others',
      name: `${firstName} ${lastName || ''}`.trim(),
      favoriteGenres: favoriteGenres || [],
      favoriteThemes: favoriteThemes || [],
      userId: null // will set later if needed
    });

    const token = jwt.sign(
      { id: newUser._id, emailid: newUser.emailid },
      getJwtSecret(),
      { expiresIn: '7d' }
    );
    res.cookie('token', token, getCookieOptions());
    res.status(201).json({
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.emailid,
        role: newUser.role || 'user',
        favoriteGenres: newUser.favoriteGenres,
        favoriteThemes: newUser.favoriteThemes
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req, res) {
  try {
    const { emailid, email, password } = req.body;
    const normalizedEmail = (emailid || email || '').trim().toLowerCase();
    const user = await User.findOne({ emailid: normalizedEmail });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, emailid: user.emailid },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    res.cookie('token', token, getCookieOptions());
    res.json({
      user: {
        id: user._id,
        name: user.name || `${user.first_name} ${user.last_name || ''}`,
        email: user.emailid,
        role: user.role || 'user'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function logout(req, res) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const decoded = jwt.decode(token);
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
      if (expiresIn > 0) {
        await redisclient.set(`token:${token}`, 'blocked', 'EX', expiresIn);
      }
    } catch (err) { /* ignore */ }
    res.clearCookie('token', getClearCookieOptions());
  }
  res.json({ message: 'Logged out' });
}

export async function getProfile(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name || `${req.user.first_name} ${req.user.last_name || ''}`,
      email: req.user.emailid,
      favoriteGenres: req.user.favoriteGenres,
      watchedMovies: req.user.watchedMovies,
      searchHistory: req.user.searchHistory
    }
  });
}

export async function adminRegister(req, res) {
  // Only admin can create other users (including admins)
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const { first_name, last_name, emailid, password, age, gender, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await User.create({
    first_name,
    last_name,
    emailid,
    password: hashedPassword,
    age,
    gender,
    role: role || 'user',
    name: `${first_name} ${last_name || ''}`.trim()
  });
  res.status(201).json({ message: 'User created', userId: newUser._id });
}
