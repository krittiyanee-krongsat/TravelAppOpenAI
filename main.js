const dotenv = require("dotenv");
dotenv.config();
const mysql = require('mysql2');
const express = require("express");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// เชื่อมต่อฐานข้อมูล
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'travelapp',
});

// สร้าง OpenAI instance
const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY,
});

// API ดึงข้อมูลจากฐานข้อมูลและส่งให้ OpenAI วิเคราะห์
app.get('/QA_transaction', async (req, res) => {
    connection.query('SELECT * FROM qa_transaction', async (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        
        // แปลงข้อมูลจากฐานข้อมูลให้เป็นข้อความสำหรับ OpenAI วิเคราะห์
        const dataForAI = results.map(row => {
            return `Trip: ${row.trip}, Distance: ${row.distance}, Budget: ${row.budget}`;
        }).join("\n");

        try {
            // ส่งข้อมูลไปให้ OpenAI วิเคราะห์
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { "role": "user", "content": `แนะนำสถานที่ภายในกรุงเทพเลือกมา 5 ข้อ:\n${dataForAI}` }
                ],
            });

            res.json({
                success: true,
                analysis: completion.choices[0].message.content
            });
        } catch (error) {
            console.error("Error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
