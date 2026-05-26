// USER CONTROLLER - Business logic for registering a new user
// Hashes the password, creates the user document, and returns safe user data.
import bcrypt from 'bcryptjs'
import { UserModel } from '../Models/UserModel.js'

// register a new user
// takes { name, email, password, role } and returns the created user (without password)
export async function register(data) {
  const { name, email, password, role } = data

  // basic validation
  if (!name || !email || !password) {
    throw new Error('Name, email and password are required')
  }

  // check if email already exists
  const existing = await UserModel.findOne({ email: email.toLowerCase() })
  if (existing) {
    throw new Error('Email already registered')
  }

  // hash the password before saving
  const hashedPassword = await bcrypt.hash(password, 10)

  // create the user document
  const user = new UserModel({
    name,
    email,
    password: hashedPassword,
    role: role || 'user',
  })
  const savedUser = await user.save()

  // return safe fields only (never send the password back)
  return {
    userId: savedUser.userId,
    name: savedUser.name,
    email: savedUser.email,
    role: savedUser.role,
  }
}
