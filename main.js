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
    database: 'travel_app',
});

// สร้าง OpenAI instance
const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY,
});

// API ดึงข้อมูลจากฐานข้อมูลและส่งให้ OpenAI วิเคราะห์
app.get('/QA_transaction', async (req, res) => {
    connection.query('SELECT qa_transaction_id, trip, distance, budget, location_interest, activity_interest FROM qa_transaction ORDER BY qa_transaction_id DESC LIMIT 1', async (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        
        // แปลงข้อมูลจากฐานข้อมูลให้เป็นข้อความสำหรับ OpenAI วิเคราะห์
        const dataForAI = results.map(row => {
            return `ID: ${row.qa_transaction_id}, Trip: ${row.trip}, Distance: ${row.distance}, Budget: ${row.budget}, LocationInterest: ${row.location_interest}, ActivityInterest: ${row.activity_interest}`;
        }).join("\n");

        try {
            // ส่งข้อมูลไปให้ OpenAI วิเคราะห์
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { "role": "user", "content": `ฉันเป็นเพื่อนของคุณที่อยู่ในกรุงเทพฯและฉันอยากช่วยแนะนำสถานที่เที่ยวที่เหมาะกับคุณมากที่สุดขอให้คุณตอบคำถามต่อไปนี้เพื่อให้ฉันเลือกสถานที่ที่ตรงกับความต้องการของคุณมากที่สุด
                                                    ตอนแสดงผลลัพธ์ให้บอกคำตอบที่เลือกมาด้วยว่าผู้ใช้เลือกคำตอบอะไรบ้าง
                                                    และแนะนำมา 5 สถานที่โดยสถานที่จะมีที่อยู่, วันเวลาทำการและรายละเอียดของสถานที่
                                                    คำถามสำหรับเลือกสถานที่เที่ยว
                                                    1. คุณเดินทางมากับใคร?
                                                    2. คุณต้องการเดินทางไกลแค่ไหนจากตำแหน่งปัจจุบันของคุณ? (ระบบจะใช้ GPS คำนวณระยะทางให้)
                                                    3. งบประมาณที่คุณตั้งไว้สำหรับทริปนี้เท่าไหร่?
                                                    4. คุณสนใจสถานที่ประเภทไหน? (เลือกได้มากกว่า 1 ข้อ)
                                                    5. คุณชอบทำกิจกรรมแนวไหน? (เลือกได้มากกว่า 1 ข้อ)\n${dataForAI}` }
                ],
            });

            res.json({
                success: true,
                analysis: completion.choices[0].message.content //ข้อความที่โมเดลสร้างขึ้นเพื่อตอบกลับ จาก OpenAI API
            });
        } catch (error) {
            console.error("Error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}/QA_transaction`);
});
