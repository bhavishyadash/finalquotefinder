-- Run this SQL on your database if you prefer manual setup.

CREATE TABLE IF NOT EXISTS users (
  userId INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  passwordHash VARCHAR(255) NOT NULL
);

-- Example: the provided create_admin.mjs script will insert an 'admin' user with password 's3cr3t' (hashed).
