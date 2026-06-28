const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const path = require('path');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Database setup
const db = new sqlite3.Database('./skillgap.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        // MUST ENABLE FOREIGN KEYS IN SQLITE
        db.run(`PRAGMA foreign_keys = ON;`); 

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);

        // ADD THE FOREIGN KEY AND ON DELETE CASCADE
        db.run(`CREATE TABLE IF NOT EXISTS analysis_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            role TEXT,
            result_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_favorite INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        console.log('Database connected with referential integrity.');
    }
});


// ==========================================
// AUTH MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
    // Expecting header format: "Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user; // This contains the { id, username } you signed earlier
        next();
    });
};

// ==========================================
// AI INTEGRATION (With Fallback Logic)
// ==========================================
async function askGemini(prompt, preferredModel = null) {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    // Define the fallback order based on your remaining daily quota
    let models = [
        { provider: 'gemini', model: 'gemini-3.5-flash', key: geminiKey }, // Prioritize this! You have 14 requests left.
        { provider: 'gemini', model: 'gemini-3-flash', key: geminiKey }, // Added Gemini 3 Flash (stable)
        { provider: 'gemini', model: 'gemini-3-flash-preview', key: geminiKey }, // Added Gemini 3 Flash Preview
        { provider: 'gemini', model: 'gemini-3.1-flash-lite', key: geminiKey }, // Added Gemini 3.1 Flash Lite
        { provider: 'gemini', model: 'gemini-3-flash-live', key: geminiKey }, // Added Gemini 3 Flash Live mode
        { provider: 'gemini', model: 'gemini-flash-latest', key: geminiKey }, // Stable fallback
        { provider: 'gemini', model: 'gemini-2.5-flash', key: geminiKey }  // Added back as a fallback for when quota resets
    ];

    if (preferredModel) {
        // Move the preferred model to the top if it exists, or insert it
        const existingIndex = models.findIndex(m => m.model === preferredModel);
        if (existingIndex > -1) {
            const [pref] = models.splice(existingIndex, 1);
            models.unshift(pref);
        } else {
            models.unshift({ provider: 'gemini', model: preferredModel, key: geminiKey });
        }
    }

    let lastError = null;

    for (const { provider, model, key } of models) {
        if (!key) {
            console.log(`Skipping ${model} due to missing API key.`);
            continue;
        }

        try {
            console.log(`Attempting computation with ${model}...`);
            let responseText = '';

            if (provider === 'gemini') {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Failed to contact Gemini (${model})`);
                responseText = data.candidates[0].content.parts[0].text;
            }

            // STRIP OUT MARKDOWN BACKTICKS JUST IN CASE AI ADDS THEM
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

            const parsed = JSON.parse(responseText);
            console.log(`Successfully computed using ${model}`);
            return parsed;

        } catch (error) {
            console.error(`${model} failed or rate limited:`, error.message);
            lastError = error;
            // Loop continues to the next fallback model
        }
    }

    throw new Error(`All AI models failed. Last error: ${lastError ? lastError.message : 'No API keys configured'}`);
}

// ==========================================
// RESUME PARSER ENDPOINT (Reads your actual PDF text)
// ==========================================
app.post('/parse-resume', express.json(), async (req, res) => {
    try {
        const text = req.body.text;
        if (!text) throw new Error("No text provided");

        // Ask Gemini to read the specific resume
        const prompt = `
        Analyze this resume text. Extract the information into a strict JSON object.
        {
            "skills": "A single comma-separated string of all technical and soft skills",
            "experience": "A 1 to 2 sentence summary of their work history",
            "scores": "Their highest degree, major certifications, or 'N/A'"
        }
        Resume Text:
        ${text}
        `;

        const parsedData = await askGemini(prompt);
        parsedData.parsed_by = "Google Gemini AI";

        res.json({ parsed: parsedData });
    } catch (error) {
        console.error('Parse Error:', error);
        res.status(500).json({ error: error.message || 'Failed to parse resume' });
    }
});

// ==========================================
// ROLE SUGGESTION ENDPOINT (Suggests roles based on skills)
// ==========================================
app.post('/suggest-roles', express.json(), async (req, res) => {
    try {
        const skills = req.body.skills;
        const experience = req.body.experience;
        if (!skills) throw new Error("Skills required for suggestion");

        const prompt = `Based on the following skills and experience, suggest 3 to 5 realistic target job roles.
        Skills: ${skills}
        Experience: ${experience || 'Not specified'}
        Return ONLY a strict JSON object in this format:
        {
            "suggestedRoles": ["Role 1", "Role 2", "Role 3"]
        }`;

        const parsedData = await askGemini(prompt, req.body.aiModel);
        res.json(parsedData);
    } catch (error) {
        console.error('Suggest Roles Error:', error);
        res.status(500).json({ error: error.message || 'Failed to suggest roles' });
    }
});

// ==========================================
// MOCK TEST ENDPOINT (Generates interview questions)
// ==========================================
app.post('/generate-mock-test', express.json(), async (req, res) => {
    try {
        const goal = req.body.goal;
        if (!goal) throw new Error("Target Role required for mock test");

        const prompt = `You are an expert technical interviewer. The candidate is interviewing for the role of "${goal}".
        Generate 3 to 5 realistic multiple-choice interview questions for this specific role. Include the question, 4 options, and the exact correct answer.
        Return ONLY a strict JSON object in this format:
        {
            "questions": [
                {
                    "question": "What is ...?",
                    "options": ["Option A", "Option B", "Option C", "Option D"],
                    "answer": "Option B"
                }
            ]
        }`;

        const parsedData = await askGemini(prompt, req.body.aiModel);
        res.json(parsedData);
    } catch (error) {
        console.error('Mock Test Error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate mock test' });
    }
});

// ==========================================
// CORE ANALYZER ENDPOINT (Generates real market demands)
// ==========================================
app.post('/analyze', authenticateToken, async (req, res) => {
    try {
        const goal = req.body.goal || 'Software Engineer';
        const userSkillsString = req.body.skills || '';
        const userSkills = userSkillsString.split(',').map(s => s.trim()).filter(s => s);

        if (userSkills.length === 0) throw new Error("Current skills are required.");

        // Allow the frontend to pass existing market demands for recalculation
        let marketSkills = req.body.marketSkills;
        if (!marketSkills || marketSkills.length === 0) {
            // Ask Gemini to dynamically generate the market demands for the Target Role
            const marketPrompt = `
            You are an expert tech recruiter. A candidate wants to become a "${goal}".
            List the top 8 to 12 most critical skills required for this specific role in the current job market.
            Return ONLY a strict JSON object in this format:
            {
                "marketSkills": [
                    { "name": "Skill Name", "domain": "Core", "type": "Programming" },
                    { "name": "Another Skill", "domain": "Cloud", "type": "Tool" }
                ]
            }
            Categorize the 'domain' into logical groups like 'Core', 'Cloud', 'Database', 'Soft Skills', etc.`;

            const aiResponse = await askGemini(marketPrompt, req.body.aiModel);
            marketSkills = aiResponse.marketSkills;
        }

        // Pass both arrays to your Python ML Engine for semantic matching
        const mlEngineUrl = process.env.ML_ENGINE_URL || 'http://127.0.0.1:50505/semantic-match';
        const mlResponse = await fetch(mlEngineUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': process.env.ML_ENGINE_SECRET || 'super_secret_internal_key_123'
            },
            body: JSON.stringify({
                user_skills: userSkills,
                market_skills: marketSkills
            })
        });

        if (!mlResponse.ok) throw new Error(`ML Engine failed (Status ${mlResponse.status})`);
        const mlData = await mlResponse.json();

        // Translate Python data for the UI
        const formattedResponse = {
            stats: {
                counts: { matched: mlData.matched.length, missing: mlData.missing.length },
                percentages: {
                    matched: Math.round((mlData.matched.length / marketSkills.length) * 100) || 0,
                    missing: Math.round((mlData.missing.length / marketSkills.length) * 100) || 0
                },
                domains: mlData.domains
            },
            roadmap: {
                matched: mlData.matched.map(m => ({ name: m.market_skill, domain: m.domain })),
                missing: mlData.missing.map(m => ({ name: m.market_skill, domain: m.domain })),
                additional: mlData.additional
            },
            courses: [
                { name: `Advanced ${goal} Masterclass`, provider: "Coursera" },
                { name: `Professional Certificate in ${goal}`, provider: "edX" }
            ],
            generated_by: 'Google Gemini AI'
        };

        // Save result to SQLite
        const stmt = db.prepare('INSERT INTO analysis_results (user_id, role, result_json) VALUES (?, ?, ?)');
        stmt.run(req.user.id, goal, JSON.stringify(formattedResponse));
        stmt.finalize();

        res.json(formattedResponse);

    } catch (error) {
        console.error('Error during analysis:', error);
        res.status(500).json({ error: error.message || 'Failed to analyze resume' });
    }
});

// ==========================================
// BASIC ROUTES (Auth & History)
// ==========================================
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ message: 'User registered', userId: this.lastID });
        });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid username or password' });

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'User logged in', token });
    });
});
app.get('/auth/me', authenticateToken, (req, res) => {
    res.json({ loggedIn: true, username: req.user.username, guest: false });
});

app.get('/api/history', authenticateToken, (req, res) => {
    // Fetch actual saved analyses from the SQLite database
    db.all(
        `SELECT id, role as goal, result_json, is_favorite, created_at 
         FROM analysis_results 
         WHERE user_id = ? 
         ORDER BY is_favorite DESC, id DESC 
         LIMIT 30`,
        [req.user.id],
        (err, rows) => {
            if (err) {
                console.error('Error fetching history:', err.message);
                return res.status(500).json({ error: 'Failed to load history from database.' });
            }
            res.json({ history: rows });
        }
    );
});

app.post('/api/history/:id/favorite', authenticateToken, (req, res) => {
    const id = req.params.id;
    db.get('SELECT is_favorite FROM analysis_results WHERE id = ? AND user_id = ?', [id, req.user.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Not found' });
        const newFav = row.is_favorite ? 0 : 1;
        db.run('UPDATE analysis_results SET is_favorite = ? WHERE id = ? AND user_id = ?', [newFav, id, req.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Update failed' });
            res.json({ success: true, is_favorite: newFav });
        });
    });
});

app.delete('/api/history/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM analysis_results WHERE id = ? AND user_id = ?', [id, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: 'Delete failed' });
        res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`Node.js API Gateway listening on port ${PORT}`));
