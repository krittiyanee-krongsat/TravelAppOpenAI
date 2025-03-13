const dotenv = require("dotenv");
dotenv.config();
const mysql = require('mysql2');
const express = require("express");
const OpenAI = require("openai");
const util = require('util');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const YAML = require('yaml');
const { connect } = require("http2");

const app = express();
const port = process.env.PORT || 3000;

// Swagger Setup
const file = fs.readFileSync('./swagger.yaml', 'utf8');
const swaggerDocument = YAML.parse(file);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Middleware
app.use(express.json());
app.use(cors({
    origin: 'http://your-trusted-frontend-domain.com', // เปลี่ยนเป็นโดเมนของ Frontend ที่คุณใช้
    methods: ['GET', 'POST'],
}));
app.use(morgan('combined'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 100, // จำกัด 100 คำขอต่อ IP
});
app.use(limiter);

// Database Connection Pool
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

// OpenAI Instance
const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY,
});

// ฟังก์ชันดึงข้อมูลจาก qa_transaction พร้อม JOIN ตารางอื่น ๆ
async function getTransactionData() {
    const query = `
        SELECT
            qa_transaction.qa_transaction_id,
            qa_transaction.account_id,
            qa_traveling.traveling_choice,
            qa_distance.distance_km,
            qa_transaction.budget,
            qa_picture.theme AS location_interest,
            GROUP_CONCAT(qa_activity_picture.theme) AS activity_interest,
            qa_transaction.longitude,
            qa_transaction.latitude
        FROM qa_transaction
        LEFT JOIN qa_traveling ON qa_transaction.trip_id = qa_traveling.traveling_id
        LEFT JOIN qa_distance ON qa_transaction.distance_id = qa_distance.distance_id
        LEFT JOIN qa_picture ON qa_transaction.location_interest_id = qa_picture.picture_id
        LEFT JOIN qa_picture AS qa_activity_picture
            ON FIND_IN_SET(qa_activity_picture.picture_id, REPLACE(REPLACE(qa_transaction.activity_interest_id, '[', ''), ']', ''))
        GROUP BY
            qa_transaction.qa_transaction_id,
            qa_transaction.account_id,
            qa_traveling.traveling_choice,
            qa_distance.distance_km,
            qa_transaction.budget,
            qa_picture.theme,
            qa_transaction.longitude,
            qa_transaction.latitude
        ORDER BY qa_transaction.qa_transaction_id DESC
        LIMIT 1;
    `;

    return new Promise((resolve, reject) => {
        pool.query(query, (err, results) => {
            if (err) reject(err);
            resolve(results[0]);
        });
    });
}

// ฟังก์ชันเรียกใช้ OpenAI เพื่อแนะนำสถานที่
async function getRecommendedPlaces(prompt) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
            { role: 'system', content: 'คุณเป็นผู้ช่วยแนะนำสถานที่ท่องเที่ยวโดยอิงจากข้อมูลผู้ใช้และบอกว่าอยู่เขตในของกรุงเทพมหานคร' },
            { role: 'user', content: prompt },
        ],
        max_tokens: 5000,
    });
    return response.choices[0].message.content.split('\n');
}

/*// ฟังก์ชันสร้าง URL รูปภาพจาก Longdo Map API
function getLongdoMapUrl(latitude, longitude) {
    return `https://map.longdo.com/api/?lat=${latitude}&lon=${longitude}&zoom=15&width=400&height=300`;
}*/

// ฟังก์ชันบันทึกผลลัพธ์ลงใน qa_results
async function saveResultsToDb(results) {
    const query = 
        `INSERT INTO qa_results 
        (account_id, event_name, event_description, start_date, end_date, results_location, results_img_url, time_schedule, recommended_location, distance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    try {
        for (const result of results) {
            await pool.promise().execute(query, [
                result.account_id,
                result.event_name,
                result.event_description,
                result.start_date,
                result.end_date,
                result.results_location,
                result.results_img_url,
                result.time_schedule,
                result.recommended_location,
                result.distance
            ]);
        }
        console.log("Results saved successfully!");
    } catch (error) {
        console.error("Error saving results to database:", error);
        // สามารถเลือกที่จะ throw error หรือจัดการข้อผิดพลาดในแบบอื่น
        throw error; // หรือจัดการข้อผิดพลาดตามที่คุณต้องการ
    }
}

// ✅ดึงข้อมูล qa_transaction
app.get('/qa_transaction', async (req, res) => {
    const query = `
         SELECT
            qa_transaction.qa_transaction_id,
            qa_transaction.account_id,
            qa_traveling.traveling_choice,
            qa_distance.distance_km,
            qa_transaction.budget,
            qa_picture.theme AS location_interest,
            GROUP_CONCAT(qa_activity_picture.theme) AS activity_interest,
            qa_transaction.longitude,
            qa_transaction.latitude
        FROM qa_transaction
        LEFT JOIN qa_traveling ON qa_transaction.trip_id = qa_traveling.traveling_id
        LEFT JOIN qa_distance ON qa_transaction.distance_id = qa_distance.distance_id
        LEFT JOIN qa_picture ON qa_transaction.location_interest_id = qa_picture.picture_id
        LEFT JOIN qa_picture AS qa_activity_picture
            ON FIND_IN_SET(qa_activity_picture.picture_id, REPLACE(REPLACE(qa_transaction.activity_interest_id, '[', ''), ']', ''))
        GROUP BY
            qa_transaction.qa_transaction_id,
            qa_transaction.account_id,
            qa_traveling.traveling_choice,
            qa_distance.distance_km,
            qa_transaction.budget,
            qa_picture.theme,
            qa_transaction.longitude,
            qa_transaction.latitude;
    `;

    pool.query(query, function(err, results) {
        if (err) {
            console.error("Database error:", err);
            res.status(500).json({ error: "Database query failed" });
        } else {
            res.json(results);
        }
    });
});

// ✅บันทึกข้อมูลคำตอบของ QA จาก User
app.post('/qa_transaction', async (req, res) => {
    try {
        const { latitude, longitude, trip_id, distance_id, budget, location_interest_id, activity_interest_id } = req.body;
        
        // ตรวจสอบข้อมูลที่จำเป็น
        if (
            !latitude || !longitude || !trip_id || !distance_id || !budget || !location_interest_id || !activity_interest_id
        ) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // ตรวจสอบให้แน่ใจว่า activity_interest_id เป็น Array
        if (!Array.isArray(activity_interest_id)) {
            return res.status(400).json({ success: false, message: "activity_interest_id must be an array." });
        }

        // แปลง activity_interest_id เป็น JSON string
        const activityInterestJSON = JSON.stringify(activity_interest_id);

        // กำหนดค่า account_id เป็น 0
        let account_id = 0;

        // บันทึกข้อมูลลงในฐานข้อมูล
        const sql = 'INSERT INTO qa_transaction (account_id, latitude, longitude, trip_id, distance_id, budget, location_interest_id, activity_interest_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const result = await pool.query(sql, [account_id, latitude, longitude, trip_id, distance_id, budget, location_interest_id, activityInterestJSON]);

        // ตรวจสอบว่าได้บันทึกข้อมูลหรือไม่
        if (result.affectedRows > 0) {
            // หลังจากบันทึกเสร็จให้ดึง account_id จากฐานข้อมูล (ค่า ID ที่ auto-incremented หรือค่าอื่นที่ต้องการ)
            account_id = result.insertId; // กำหนดค่า account_id เป็น insertId จากฐานข้อมูล

            // อัปเดต record ด้วย account_id ที่ถูกต้อง
            const updateSql = 'UPDATE qa_transaction SET account_id = ? WHERE qa_transaction_id = ?';
            await pool.query(updateSql, [account_id, result.insertId]);

            res.json({
                success: true,
                message: "Transaction saved and account_id updated successfully!",
                data: { account_id, latitude, longitude, trip_id, distance_id, budget, location_interest_id, activity_interest_id }
            });
        } else {
            res.status(500).json({ success: false, message: "Failed to save transaction." });
        }

    } catch (error) {
        console.error("Error saving transaction:", error);
        res.status(500).json({ success: false, error: "Internal server error." });
    }
});

/*
// API: แนะนำสถานที่
app.post('/recommend-places', async (req, res) => {
    try {
        // ดึงข้อมูลจาก qa_transaction
        const transactionData = await getTransactionData();

        // สร้าง prompt สำหรับ OpenAI
        const prompt = `แนะนำสถานที่ 5 แห่งในกรุงเทพมหานครโดยพิจารณาข้อมูลต่อไปนี้: สถานที่ที่สนใจ ${transactionData.location_interest}, 
                        กิจกรรมที่สนใจ ${transactionData.activity_interest}, ระยะทาง ${transactionData.distance_km}, ตำแหน่งปัจจุบัน ${transactionData.latitude}, ${transactionData.longitude}`;

        // เรียกใช้ OpenAI เพื่อแนะนำสถานที่
        const recommendedPlaces = await getRecommendedPlaces(prompt);

        // สร้างผลลัพธ์พร้อมรูปภาพจาก Longdo Map API
        const results = recommendedPlaces.map((place, index) => ({
            account_id: transactionData.account_id,
            results_img_url: getLongdoMapUrl(13.75 + index * 0.01, 100.5 + index * 0.01), // สมมติค่า latitude, longitude
            results_location_name: place,
            results_open_day: '10 มิถุนายน-30 มิถุนายน 2567',
            results_location: 'กรุงเทพมหานคร',
            results_business_hours: '10:00 - 22:00',
            results_description: `คำอธิบายสถานที่ ${place}`,
            results_distance: (index + 1) * 2.0, // สมมติค่าระยะทาง
        }));

        // บันทึกผลลัพธ์ลงใน qa_results
        await saveResultsToDb(results);

        // ส่งผลลัพธ์กลับไปให้ผู้ใช้
        res.status(200).json({ success: true, results });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการประมวลผล' });
    }
});
/*
/*
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
            model: "gpt-4o",
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
})*/

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: "Internal server error." });
});

// Start Server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});