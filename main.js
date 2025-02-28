const dotenv = require("dotenv");
dotenv.config();
const mysql = require('mysql2');
const express = require("express");
const OpenAI = require("openai");
const util = require('util');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 3000;

//Swagger
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const YAML = require('yaml');
const file = fs.readFileSync('./swagger.yaml', 'utf8');
const swaggerDocument = YAML.parse(file);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Middleware
app.use(express.json());
app.use(cors({
    origin: 'http://your-trusted-frontend-domain.com',
    methods: ['GET', 'POST'],
}));
app.use(morgan('combined'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 100, // จำกัด 100 คำขอต่อ IP
});
app.use(limiter);

// เชื่อมต่อฐานข้อมูล
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
pool.query = util.promisify(pool.query);

// สร้าง OpenAI instance
const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY,
});

// ✅ API: บันทึกข้อมูลพิกัดและตัวเลือก
app.post('/qa_transaction', async (req, res) => {
    try {
        const { latitude, longitude, trip, distance, budget, location_interest, activity_interest } = req.body;

        // ตรวจสอบข้อมูล
        if (
            !latitude || !longitude || !trip || !distance || !budget || !location_interest || !activity_interest
        ) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // แปลง activity_interest เป็น JSON string เป็น Array
        const activityInterestJSON = JSON.stringify(activity_interest);

        // บันทึกข้อมูลลงในฐานข้อมูล
        const sql = 'INSERT INTO qa_transaction (latitude, longitude, trip, distance, budget, location_interest, activity_interest) VALUES (?, ?, ?, ?, ?, ?, ?)';
        await pool.query(sql, [latitude, longitude, trip, distance, budget, location_interest, activityInterestJSON]);

        res.json({
            success: true,
            message: "Transaction saved successfully!",
            data: { latitude, longitude, trip, distance, budget, location_interest, activity_interest }
        });
    } catch (error) {
        console.error("Error saving transaction:", error);
        res.status(500).json({ success: false, error: "Internal server error." });
    }
});

// ✅ API: ดึงข้อมูลล่าสุดจากฐานข้อมูล + วิเคราะห์ด้วย OpenAI
app.get('/qa_transaction', async (req, res) => {
    try {
        // ดึงข้อมูลล่าสุด
        const qa_results = await pool.query('SELECT qa_transaction_id, trip, distance, budget, location_interest, activity_interest, latitude, longitude FROM qa_transaction ORDER BY qa_transaction_id DESC LIMIT 1');

        if (qa_results.length === 0) {
            return res.status(404).json({ success: false, message: "No data found." });
        }

        const qa_row = qa_results[0];

         // แปลง activity_interest จาก JSON string เป็น Array
         const activityInterestArray = JSON.parse(qa_row.activity_interest);

        // ✅ เตรียมข้อความสำหรับ OpenAI
        const userInput = `
        ข้อมูลของผู้ใช้:
        - ID: ${qa_row.qa_transaction_id}
        - เดินทางกับ: ${qa_row.trip}
        - ระยะทางที่ต้องการ: ${qa_row.distance}
        - งบประมาณ: ${qa_row.budget}
        - ประเภทสถานที่ที่สนใจ: ${qa_row.location_interest}
        - กิจกรรมที่สนใจ: ${activityInterestArray.join(', ')}
        - ตำแหน่งพิกัด: ${qa_row.latitude}, ${qa_row.longitude}
        
        ช่วยแนะนำ 5 สถานที่ท่องเที่ยวที่เหมาะสม โดยแสดง:
        - ชื่อสถานที่
        - ที่อยู่
        - วันเวลาทำการ
        - รายละเอียดเพิ่มเติมของสถานที่
        `.trim();

        // ✅ ส่งข้อมูลให้ OpenAI วิเคราะห์
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { "role": "system", "content": "คุณเป็นผู้ช่วยแนะนำสถานที่ท่องเที่ยวโดยอิงจากข้อมูลผู้ใช้และบอกว่าอยู่เขตในของกรุงเทพมหานคร" },
                { "role": "user", "content": userInput }
            ],
        });

        res.json({
            success: true,
            recommendations: completion.choices[0].message.content
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, error: "Internal server error." });
    }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: "Internal server error." });
});

// ✅ เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});