import express from 'express';
import mysql from 'mysql2/promise';
import session from 'express-session';
import bcrypt from 'bcryptjs';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

//setting up database connection pool
const pool = mysql.createPool({
  host: "w1h4cr5sb73o944p.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
  user: "dm5wpehi1fax66yr",
  password: "e1u74ctz365ka1km",
  database: "kored9cpw98qxwn4",
  connectionLimit: 10,
  waitForConnections: true
});

// session setup
app.use(
  session({
    secret: 'replace_this_with_a_real_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
  })
);

// --- Helper middleware ---
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect('/login');
}

// Home - list authors
app.get('/', async (req, res) => {
  const sql = `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName ASC`;
  const [rows] = await pool.query(sql);
  res.render('home.ejs', { rows, user: req.session.user });
});

// ---------- Authentication routes ----------
// show login form
app.get('/login', (req, res) => {
  res.render('login.ejs', { error: null });
});

// handle login
app.post('/login', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  try {
    // find user in DB
    const [users] = await pool.query('SELECT userId, username, passwordHash FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.render('login.ejs', { error: 'Invalid credentials' });
    const user = users[0];
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.render('login.ejs', { error: 'Invalid credentials' });

    // set session
    req.session.userId = user.userId;
    req.session.user = { username: user.username };
    res.redirect('/admin');
  } catch (err) {
    console.error('Login error:', err?.code || err?.message || err);
    // If the users table doesn't exist, give a helpful message and link to setup route
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/.test(err.message || ''))) {
      return res.render('login.ejs', { error: 'Admin table not found. Run the setup to create the users table and seed an admin user. Visit /setup-users?secret=dev-setup-secret to do this (development only).' });
    }
    return res.render('login.ejs', { error: 'Database error. Check server logs.' });
  }
});

// Dev-only setup route: create users table and seed admin user
// Usage: /setup-users?secret=<SECRET>
app.get('/setup-users', async (req, res) => {
  const secret = req.query.secret || process.env.SETUP_SECRET || 'dev-setup-secret';
  if (req.query.secret !== secret) {
    return res.status(403).send('Forbidden');
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        userId INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        passwordHash VARCHAR(255) NOT NULL
      )
    `);

    const username = 'admin';
    const password = 's3cr3t';
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT IGNORE INTO users (username, passwordHash) VALUES (?, ?)', [username, hash]);
    res.send('Users table created and admin user ensured (username: admin, password: s3cr3t)');
  } catch (err) {
    console.error('Setup users error:', err);
    res.status(500).send('Failed to setup users: ' + (err.message || err));
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    res.redirect('/');
  });
});

// Admin dashboard
app.get('/admin', requireLogin, (req, res) => {
  res.render('admin.ejs', { user: req.session.user });
});

// ---------- Authors CRUD ----------
app.get('/admin/authors', requireLogin, async (req, res) => {
  const [authors] = await pool.query('SELECT * FROM authors ORDER BY lastName');
  res.render('admin_authors.ejs', { authors });
});

app.get('/admin/authors/add', requireLogin, (req, res) => {
  res.render('addAuthor.ejs', { author: {} });
});

app.post('/admin/authors/add', requireLogin, async (req, res) => {
  const { fn, ln, dob, bio } = req.body;
  // basic validation
  if (!fn || !ln) {
    return res.render('addAuthor.ejs', { author: { firstName: fn, lastName: ln, dob, bio }, error: 'First and last name are required.' });
  }
  await pool.query('INSERT INTO authors (firstName, lastName, dob, bio) VALUES (?, ?, ?, ?)', [fn, ln, dob || null, bio || null]);
  res.redirect('/admin/authors');
});

app.get('/admin/authors/edit/:authorId', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM authors WHERE authorId = ?', [req.params.authorId]);
  if (rows.length === 0) return res.redirect('/admin/authors');
  res.render('addAuthor.ejs', { author: rows[0] });
});

app.post('/admin/authors/edit/:authorId', requireLogin, async (req, res) => {
  const id = req.params.authorId;
  const { fn, ln, dob, bio } = req.body;
  if (!fn || !ln) {
    return res.render('addAuthor.ejs', { author: { authorId: id, firstName: fn, lastName: ln, dob, bio }, error: 'First and last name are required.' });
  }
  await pool.query('UPDATE authors SET firstName = ?, lastName = ?, dob = ?, bio = ? WHERE authorId = ?', [fn, ln, dob || null, bio || null, id]);
  res.redirect('/admin/authors');
});

app.post('/admin/authors/delete/:authorId', requireLogin, async (req, res) => {
  const id = req.params.authorId;
  await pool.query('DELETE FROM authors WHERE authorId = ?', [id]);
  res.redirect('/admin/authors');
});

// ---------- Quotes CRUD ----------
app.get('/admin/quotes', requireLogin, async (req, res) => {
  const [rows] = await pool.query(`SELECT q.quoteId, q.quote, a.firstName, a.lastName FROM quotes q JOIN authors a USING(authorId) ORDER BY q.quoteId DESC`);
  res.render('admin_quotes.ejs', { quotes: rows });
});

app.get('/admin/quotes/add', requireLogin, async (req, res) => {
  const [authors] = await pool.query('SELECT authorId, firstName, lastName FROM authors ORDER BY lastName');
  res.render('addQuote.ejs', { authors, quote: {} });
});

app.post('/admin/quotes/add', requireLogin, async (req, res) => {
  const { quote, authorId } = req.body;
  const [authors] = await pool.query('SELECT authorId, firstName, lastName FROM authors ORDER BY lastName');
  if (!quote || !authorId) {
    return res.render('addQuote.ejs', { authors, quote: { quote, authorId }, error: 'Quote text and author are required.' });
  }
  await pool.query('INSERT INTO quotes (quote, authorId) VALUES (?, ?)', [quote, authorId]);
  res.redirect('/admin/quotes');
});

app.get('/admin/quotes/edit/:quoteId', requireLogin, async (req, res) => {
  const qid = req.params.quoteId;
  const [quoteRows] = await pool.query('SELECT * FROM quotes WHERE quoteId = ?', [qid]);
  const quote = quoteRows[0];
  const [authors] = await pool.query('SELECT authorId, firstName, lastName FROM authors ORDER BY lastName');
  if (!quote) return res.redirect('/admin/quotes');
  res.render('addQuote.ejs', { authors, quote });
});

app.post('/admin/quotes/edit/:quoteId', requireLogin, async (req, res) => {
  const qid = req.params.quoteId;
  const { quote, authorId } = req.body;
  const [authors] = await pool.query('SELECT authorId, firstName, lastName FROM authors ORDER BY lastName');
  if (!quote || !authorId) {
    return res.render('addQuote.ejs', { authors, quote: { quoteId: qid, quote, authorId }, error: 'Quote text and author are required.' });
  }
  await pool.query('UPDATE quotes SET quote = ?, authorId = ? WHERE quoteId = ?', [quote, authorId, qid]);
  res.redirect('/admin/quotes');
});

app.post('/admin/quotes/delete/:quoteId', requireLogin, async (req, res) => {
  const qid = req.params.quoteId;
  await pool.query('DELETE FROM quotes WHERE quoteId = ?', [qid]);
  res.redirect('/admin/quotes');
});

// API: get specific author
app.get('/api/authors/:authorId', async (req, res) => {
  let authorId = req.params.authorId;
  let sql = `SELECT * FROM authors WHERE authorId = ?`;
  const [rows] = await pool.query(sql, [authorId]);
  res.send(rows);
});

// Search routes (fixed LIKE wildcard usage)
app.get('/searchByKeyword', async (req, res) => {
  const keyword = req.query.keyword || '';
  const sql = `SELECT a.authorId, a.firstName, a.lastName, q.quote FROM authors a JOIN quotes q USING(authorId) WHERE q.quote LIKE ?`;
  const [rows] = await pool.query(sql, ['%' + keyword + '%']);
  res.render('results.ejs', { rows, keyword });
});

app.get('/searchByAuthor', async (req, res) => {
  const authorId = req.query.authorId;
  const sql = `SELECT a.authorId, a.firstName, a.lastName, q.quote FROM authors a JOIN quotes q USING(authorId) WHERE a.authorId = ?`;
  const [rows] = await pool.query(sql, [authorId]);
  res.render('results.ejs', { rows, authorId });
});

app.get('/searchByCategory', async (req, res) => {
  const categoryId = req.query.categoryId;
  const sql = `SELECT DISTINCT c.categoryId, c.categoryName, q.quote FROM authors a JOIN quotes q USING(authorId) JOIN quote_categories qc USING(quoteId) JOIN categories c USING(categoryId) WHERE c.categoryId = ?`;
  const [rows] = await pool.query(sql, [categoryId]);
  res.render('results.ejs', { rows, categoryId });
});

app.listen(3000, () => {
  console.log('Express server running on http://localhost:3000');
});
