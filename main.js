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
const axios = require("axios");
const { application } = require("express");

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

/*
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
}*/

/* Test1 OpenAI
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
}*/

// ✅Test2 OpenAI
async function getRecommendedPlaces(data) {
    // ฟังก์ชันช่วยแปลงข้อมูลจากตัวเลขเป็นข้อความ
    function translateChoice(choice, type) {
        switch (type) {
            case 'trip_id':
                switch (choice) {
                    case 1: return 'เดินทางคนเดียว';
                    case 2: return 'เดินทางกับครอบครัว';
                    case 3: return 'เดินทางกับแฟน';
                    case 4: return 'เดินทางกับเพื่อน';
                    default: return 'ไม่ระบุ';
                }
            case 'distance_id':
                switch (choice) {
                    case 1: return '0-5 กิโลเมตร';
                    case 2: return '5-10 กิโลเมตร';
                    case 3: return '10-15 กิโลเมตร';
                    case 4: return '15-20 กิโลเมตร';
                    default: return 'ไม่ระบุ';
                }
            case 'location_interest_id':
                switch (choice) {
                    case 1: return 'คาเฟ่และกิจกรรมต่างๆ';
                    case 2: return 'สวนสาธารณะ';
                    case 3: return 'สวนสนุกและสวนน้ำ';
                    case 4: return 'งานศิลปะและนิทรรศการ';
                    case 5: return 'สปาและออนเซ็น';
                    case 6: return 'ห้างสรรพสินค้า';
                    case 7: return 'ร้านอาหารและเครื่องดื่ม';
                    case 8: return 'วัดและสถานที่โบราณ';
                    default: return 'ไม่ระบุ';
                }
            case 'activity_interest_id':
                if (!Array.isArray(choice)) return 'ไม่ระบุ';
                return choice.map(activity => {
                    switch (activity) {
                        case 1: return 'คาเฟ่และกิจกรรมต่างๆ';
                        case 2: return 'สวนสาธารณะ';
                        case 3: return 'สวนสนุกและสวนน้ำ';
                        case 4: return 'งานศิลปะและนิทรรศการ';
                        case 5: return 'สปาและออนเซ็น';
                        case 6: return 'ห้างสรรพสินค้า';
                        case 7: return 'ร้านอาหารและเครื่องดื่ม';
                        case 8: return 'วัดและสถานที่โบราณ';
                        default: return 'ไม่ระบุ';
                    }
                }).join(', ');
            default:
                return choice || 'ไม่ระบุ';
        }
    }

    // แปลงข้อมูลที่ผู้ใช้เลือกจากตัวเลขเป็นข้อความ
    const translatedData = {
        trip_id: translateChoice(data.trip_id, 'trip_id'),
        distance_id: translateChoice(data.distance_id, 'distance_id'),
        budget: data.budget || 'ไม่ระบุ',
        location_interest_id: translateChoice(data.location_interest_id, 'location_interest_id'),
        activity_interest_id: translateChoice(data.activity_interest_id, 'activity_interest_id')
    };

    // สร้าง prompt เพื่อขอคำแนะนำจาก OpenAI
    const prompt = `
    คุณได้เลือกคำตอบดังนี้:
    - ประเภทการเดินทาง: ${translatedData.trip_id}
    - ระยะทาง: ${translatedData.distance_id}
    - งบประมาณ: ${translatedData.budget} บาท
    - สถานที่ที่สนใจ: ${translatedData.location_interest_id}
    - กิจกรรมที่สนใจ: ${translatedData.activity_interest_id}

    โปรดแนะนำสถานที่ท่องเที่ยวในกรุงเทพมหานครที่เหมาะสม 5 สถานที่ โดยระบุข้อมูลแต่ละสถานที่ดังนี้:
    1. ชื่อสถานที่ (event_name): <ชื่อสถานที่>
       รายละเอียดสถานที่ (event_description): <รายละเอียดสั้นๆ เกี่ยวกับสถานที่>
       ที่ตั้งสถานที่ (results_location): <ที่ตั้งสถานที่>
       วันเปิดบริการ (open_day): <วันเปิดบริการ>
       เวลาเปิด-ปิด (time_schedule): <เวลาเปิด-ปิด>
       ระยะทางจากผู้ใช้ (distance): <ระยะทางจากผู้ใช้>
       ลิงก์รูปภาพ (results_img_url): <ลิงก์รูปภาพ>
    2. ชื่อสถานที่ (event_name): <ชื่อสถานที่>
       รายละเอียดสถานที่ (event_description): <รายละเอียดสั้นๆ เกี่ยวกับสถานที่>
       ที่ตั้งสถานที่ (results_location): <ที่ตั้งสถานที่>
       วันเปิดบริการ (open_day): <วันเปิดบริการ>
       เวลาเปิด-ปิด (time_schedule): <เวลาเปิด-ปิด>
       ระยะทางจากผู้ใช้ (distance): <ระยะทางจากผู้ใช้>
       ลิงก์รูปภาพ (results_img_url): <ลิงก์รูปภาพ>
    3. ชื่อสถานที่ (event_name): <ชื่อสถานที่>
       รายละเอียดสถานที่ (event_description): <รายละเอียดสั้นๆ เกี่ยวกับสถานที่>
       ที่ตั้งสถานที่ (results_location): <ที่ตั้งสถานที่>
       วันเปิดบริการ (open_day): <วันเปิดบริการ>
       เวลาเปิด-ปิด (time_schedule): <เวลาเปิด-ปิด>
       ระยะทางจากผู้ใช้ (distance): <ระยะทางจากผู้ใช้>
       ลิงก์รูปภาพ (results_img_url): <ลิงก์รูปภาพ>
    4. ชื่อสถานที่ (event_name): <ชื่อสถานที่>
       รายละเอียดสถานที่ (event_description): <รายละเอียดสั้นๆ เกี่ยวกับสถานที่>
       ที่ตั้งสถานที่ (results_location): <ที่ตั้งสถานที่>
       วันเปิดบริการ (open_day): <วันเปิดบริการ>
       เวลาเปิด-ปิด (time_schedule): <เวลาเปิด-ปิด>
       ระยะทางจากผู้ใช้ (distance): <ระยะทางจากผู้ใช้>
       ลิงก์รูปภาพ (results_img_url): <ลิงก์รูปภาพ>
    5. ชื่อสถานที่ (event_name): <ชื่อสถานที่>
       รายละเอียดสถานที่ (event_description): <รายละเอียดสั้นๆ เกี่ยวกับสถานที่>
       ที่ตั้งสถานที่ (results_location): <ที่ตั้งสถานที่>
       วันเปิดบริการ (open_day): <วันเปิดบริการ>
       เวลาเปิด-ปิด (time_schedule): <เวลาเปิด-ปิด>
       ระยะทางจากผู้ใช้ (distance): <ระยะทางจากผู้ใช้>
       ลิงก์รูปภาพ (results_img_url): <ลิงก์รูปภาพ>
    `;

    try {
        // เรียกใช้ OpenAI API
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2000
        });
    
        // ตรวจสอบ response ก่อนใช้
        if (!response.choices || response.choices.length === 0) {
            throw new Error("No response from OpenAI API");
        }
    
        // ดึงคำตอบจาก API
        const recommendation = response.choices[0].message?.content?.trim() || "ไม่พบคำแนะนำ";
        console.log("OpenAI Response:", recommendation);
    
        // แยกคำแนะนำออกเป็น 5 สถานที่
        const recommendations = recommendation.split('\n\n').filter(rec => rec.trim() !== '');
    
        // สร้างผลลัพธ์สำหรับแต่ละสถานที่
        const results = recommendations.map((rec, index) => {
            const lines = rec.split('\n');
            const eventName = lines[0]?.split(': ')[1]?.trim() || `สถานที่ ${index + 1}`;
            const eventDescription = lines[1]?.split(': ')[1]?.trim() || 'ไม่มีรายละเอียด';
            const resultsLocation = lines[2]?.split(': ')[1]?.trim() || 'ไม่ระบุที่ตั้ง';
            const openDay = lines[3]?.split(': ')[1]?.trim() || 'เปิดบริการทุกวัน';
            const timeSchedule = lines[4]?.split(': ')[1]?.trim() || '10:00-22:00';
            const distance = lines[5]?.split(': ')[1]?.trim() || translatedData.distance_id;
            const resultsImgUrl = lines[6]?.split(': ')[1]?.trim() || 'https://via.placeholder.com/400x200?text=No+Image+Found';
    
            // กำหนดข้อมูลแต่ละสถานที่
            return {
                results_id: index + 1, // เพิ่ม results_id
                event_name: eventName,
                event_description: eventDescription,
                open_day: openDay,
                time_schedule: timeSchedule,
                results_location: resultsLocation,
                results_img_url: resultsImgUrl,
                distance: distance
            };
        });
    
        return results;
    } catch (error) {
        console.error("Error fetching recommendations:", error);
        throw error;
    }
}
/*// ฟังก์ชันสร้าง URL รูปภาพจาก Longdo Map API
function getLongdoMapUrl(latitude, longitude) {
    return `https://map.longdo.com/api/?lat=${latitude}&lon=${longitude}&zoom=15&width=400&height=300`;
}*/

/*
// ฟังก์ชันค้นหารูปภาพจาก Wikimedia
async function getWikimediaImage(locationName) {
    try {
        // เตรียม URL สำหรับ API ค้นหารูปภาพ
        const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=original&generator=search&gsrsearch=${encodeURIComponent(locationName)}&gsrlimit=1`;

        // ดึงข้อมูลจาก Wikimedia API
        const response = await fetch(searchUrl);
        const data = await response.json();

        // ตรวจสอบว่ามีผลลัพธ์หรือไม่
        if (data.query && data.query.pages) {
            const pages = Object.values(data.query.pages);
            if (pages.length > 0 && pages[0].original) {
                return pages[0].original.source; // คืนค่า URL ของภาพแรกที่พบ
            }
        }

        // ❌ ถ้าไม่พบรูปภาพ ให้ลองตัดคำบางคำออก แล้วค้นหาใหม่
        const alternativeName = locationName.split(' ')[0]; // ลองใช้แค่คำแรกของชื่อสถานที่
        if (alternativeName !== locationName) {
            return await getWikimediaImage(alternativeName); // ค้นหาใหม่
        }

        // ❌ ถ้าไม่มีภาพ ให้คืน Placeholder Image
        return "https://via.placeholder.com/400x200?text=No+Image+Found";
    } catch (error) {
        console.error("Error fetching Wikimedia image:", error);
        return "https://via.placeholder.com/400x200?text=No+Image+Found"; // กรณีเกิดข้อผิดพลาด
    }
}*/

// ✅ฟังก์ชันบันทึกผลลัพธ์ลงใน qa_results
async function saveResultsToDb(results, account_id) {
    const query = `
        INSERT INTO qa_results 
        (account_id, event_name, event_description, open_day, results_location, time_schedule, results_img_url, distance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    try {
        for (const result of results) {
            // บันทึกข้อมูลลงในฐานข้อมูล
            await pool.promise().execute(query, [
                account_id, // ใช้ account_id ที่ส่งมา
                result.event_name || null,
                result.event_description || null,
                result.open_day || null,
                result.results_location || null,
                result.time_schedule || null,
                result.results_img_url || null,
                result.distance || null
            ]);
        }
        console.log("Results saved successfully!");
    } catch (error) {
        console.error("Error saving results to database:", error);
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
            // หลังจากบันทึกเสร็จให้ดึง account_id จากฐานข้อมูล
            account_id = result.insertId;

            // อัปเดต record ด้วย account_id ที่ถูกต้อง
            const updateSql = 'UPDATE qa_transaction SET account_id = ? WHERE qa_transaction_id = ?';
            await pool.query(updateSql, [account_id, result.insertId]);

            // ส่งข้อมูลไปประมวลผลด้วย OpenAI
            const openAIResults = await getRecommendedPlaces({
                latitude,
                longitude,
                trip_id,
                distance_id,
                budget,
                location_interest_id,
                activity_interest_id
            });

            // บันทึกผลลัพธ์ลงใน qa_results
            await saveResultsToDb(openAIResults, account_id);

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

// ✅ดึงข้อมูล qa_results
app.get('/qa_results', async (req, res) => {
    const query = `SELECT * FROM qa_results`;

    pool.query(query, function(err, results) {
        if (err) {
            console.error("Database error:", err);
            res.status(500).json({ error: "Database query failed" });
        } else {
            res.json(results);
        }
    });
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