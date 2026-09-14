import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const userSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true },
    last_name: { type: String },
    emailid: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['male', 'female', 'others'] },
    photo: { type: String, default: 'default.jpg' },
    // userId field removed – use _id
    name: { type: String },
    favoriteGenres: { type: [String], default: [] },
    favoriteActors: { type: [String], default: [] },
    favoriteThemes: { type: [String], default: [] },
    watchedMovies: [
      {
        movieKey: String,
        rating: Number,
        liked: Boolean,
        disliked: Boolean,
        skipped: Boolean,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    searchHistory: [
      {
        keyword: String,
        frequency: { type: Number, default: 1 },
        lastUsed: { type: Date, default: Date.now },
      },
    ],
  },
  { autoIndex: false } // prevents Mongoose from creating/updating indexes
);

userSchema.methods.verifypassword = async function (userpassword) {
  return await bcrypt.compare(userpassword, this.password);
};

userSchema.methods.getJWT = function () {
  return jwt.sign(
    { id: this._id, emailid: this.emailid },
    process.env.SECRET_KEY,
    { expiresIn: '1800s' }
  );
};

export const User = mongoose.model('User', userSchema);