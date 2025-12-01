import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

async function run(){
  const pool = mysql.createPool({
    host: "w1h4cr5sb73o944p.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "dm5wpehi1fax66yr",
    password: "e1u74ctz365ka1km",
    database: "kored9cpw98qxwn4",
    connectionLimit: 5
  });

  const username = 'admin';
  const password = 's3cr3t';
  const hash = await bcrypt.hash(password, 10);

  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    userId INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    passwordHash VARCHAR(255)
  )`);

  await pool.query('INSERT IGNORE INTO users (username, passwordHash) VALUES (?, ?)', [username, hash]);
  console.log('Admin user ensured:', username);
  process.exit(0);
}

run().catch(err=>{console.error(err); process.exit(1)});
