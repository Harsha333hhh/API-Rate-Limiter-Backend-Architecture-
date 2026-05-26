// AUTH SERVICE - Handles login authentication
// Verifies email + password and returns a signed JWT token plus safe user details.
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { UserModel } from '../Models/UserModel.js'

// authenticate a user from their login credentials
// takes { email, password } and returns { token, user }
export async function authenticate(userCred) {
  const { email, password } = userCred

  // basic validation
  if (!email || !password) {
    throw new Error('Email and password are required')
  }

  // find the user by email
  const user = await UserModel.findOne({ email: email.toLowerCase() })
  if (!user) {
    throw new Error('Invalid credentials')
  }

  // compare the given password against the stored hash
  const isMatch = await bcrypt.compare(password, user.password)
  if (!isMatch) {
    throw new Error('Invalid credentials')
  }

  // sign a JWT token - we put the friendly userId inside it
  const token = jwt.sign(
    { userId: user.userId, role: user.role },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '7d' }
  )

  // return token and safe user details
  return {
    token,
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  }
}
