const { Sequelize } = require('sequelize');
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
app.use(morgan('dev'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 100, // จำกัด 100 คำขอต่อ IP
});
app.use(limiter);

// Database Connection
const sequelize = new Sequelize(
    process.env.DB_NAME, 
    process.env.DB_USER, 
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false,
    }
);

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
        // (ไม่มีการเปลี่ยนแปลงในส่วนนี้)
        switch (type) {
            case 'trip_id':
                switch (choice) {
                    case 1: return 'เดินทางคนเดียว';
                    case 2: return 'เดินทางกับครอบครัว';
                    case 3: return 'เดินทางกับแฟน';
                    case 4: return 'เดินทางกับเพื่อน';
                    case 5: return 'เดินทางกับเพื่อนร่วมงาน';
                    case 6: return 'เดินทางกับเด็ก/ผู้สูงอายุ';
                    case 7: return 'เดินทางกับสัตว์เลี้ยง';
                    default: return 'ไม่ระบุ';
                }
            case 'distance_id':
                switch (choice) {
                    case 1: return '0-50 กิโลเมตร';
                    case 2: return '51-100 กิโลเมตร';
                    case 3: return '101-200 กิโลเมตร';
                    case 4: return 'มากกว่า 200 กิโลเมตร';
                    default: return 'ไม่ระบุ';
                }
            case 'location_interest_id':
                switch (choice) {
                    case 1: return 'คาเฟ่และกิจกรรมต่างๆ';
                    case 2: return 'สวนสาธารณะ';
                    case 3: return 'สวนสนุกและสวนน้ำ';
                    case 4: return 'งานศิลปะและนิทรรศการ';
                    case 5: return 'ธรรมชาติ';
                    case 6: return 'กิจกรรมและผญจภัย';
                    case 7: return 'ตลาดนัดและถนนคนเดิน';
                    case 8: return 'วัดและสถานที่โบราณ';
                    default: return 'ไม่ระบุ';
                }
            case 'activity_id':
                if (!Array.isArray(choice)) return 'ไม่ระบุ';
                return choice.map(activity => {
                    switch (activity) {
                        case 1: return 'ชิมอาหารริมทางและช้อปปิ้งในตลาด';
                        case 2: return 'กิจกรรมผ่อนคลายและฟื้นฟูร่างกาย';
                        case 3: return 'กิจกรรมผจญภัย';
                        case 4: return 'กิจกรรมสำรวจธรรมชาติ';
                        case 5: return 'กิจกรรมทางวัฒนธรรม';
                        case 6: return 'กิจกรรมทางน้ำ';
                        default: return 'ไม่ระบุ';
                    }
                }).join(', ');
            case 'emotional_id':
                switch (choice) {
                    case 1: return 'รู้สึกมีความรัก';
                    case 2: return 'รู้สึกมีความสุข';
                    case 3: return 'รู้สึกสบายๆ';
                    case 4: return 'รู้สึกเศร้า';
                    case 5: return 'รู้สึกเหนื่อยล้า';
                    case 6: return 'รู้สึกหิว';
                    case 7: return 'รู้สึกเซ็ง';
                    case 8: return 'รู้สึกโกรธ';
                    case 9: return 'รู้สึกเบื่อ';
                    case 10: return 'รู้สึกเพิ่งเสร็จงาน';
                    default: return 'ไม่ระบุ';
                }
            case 'value_id':
                switch (choice) {
                    case 1: return '100-500 บาท';
                    case 2: return '550-1,000 บาท';
                    case 3: return '1,500-2,000 บาท';
                    case 4: return '5,500-10,000 บาท';
                }
            default:
                return choice || 'ไม่ระบุ';
        }
    }

    // แปลงข้อมูลที่ผู้ใช้เลือกจากตัวเลขเป็นข้อความ
    const translatedData = {
        trip_id: translateChoice(data.trip_id, 'trip_id'),
        distance_id: translateChoice(data.distance_id, 'distance_id'),
        value_id: translateChoice(data.value_id, 'value_id'),
        location_interest_id: translateChoice(data.location_interest_id, 'location_interest_id'),
        activity_id: translateChoice(data.activity_id, 'activity_id'),
        emotional_id: translateChoice(data.emotional_id, 'emotional_id'),
    };

    // ฟังก์ชันแปลงชื่อสถานที่จากภาษาไทยเป็นภาษาอังกฤษ
    async function translateToEnglish(thaiName) {
        try {
            // ใช้ OpenAI API เพื่อแปลชื่อสถานที่
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ 
                    role: "user", 
                    content: `แปลชื่อสถานที่ท่องเที่ยวในประเทศไทยนี้เป็นภาษาอังกฤษ (ให้ตอบเฉพาะชื่อภาษาอังกฤษเท่านั้น ไม่ต้องมีข้อความอื่น): ${thaiName}` 
                }],
                max_tokens: 1000
            });
            
            // ดึงคำตอบและตัดช่องว่าง
            const englishName = response.choices[0].message?.content?.trim() || thaiName;
            console.log(`Translated: ${thaiName} -> ${englishName}`);
            return englishName;
        } catch (error) {
            console.error("Error translating place name:", error);
            return thaiName; // หากแปลไม่สำเร็จ ให้ใช้ชื่อเดิม
        }
    }

    // ฟังก์ชันดึงรูปภาพจาก Wikimedia API
    async function getWikimediaImage(placeName) {
        try {
            // แปลชื่อสถานที่เป็นภาษาอังกฤษก่อน
            const englishName = await translateToEnglish(placeName);
            
            // สร้างคำค้นหาที่เฉพาะเจาะจงมากขึ้น
            const searchTerms = [
                `${englishName} Bangkok Thailand`,
                `${englishName} Thailand tourism`,
                `${englishName} Thailand`,
                englishName
            ];
            
            // ลองค้นหาด้วยคำค้นหาต่างๆ จนกว่าจะพบรูปภาพ
            for (const searchTerm of searchTerms) {
                // สร้าง URL สำหรับ API request
                const encodedSearchTerm = encodeURIComponent(searchTerm);
                const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodedSearchTerm}&srnamespace=6&format=json&origin=*`;
                
                // ส่ง request ไปยัง Wikimedia API
                const response = await fetch(apiUrl);
                const data = await response.json();
                
                // ตรวจสอบว่ามีผลลัพธ์หรือไม่
                if (data.query && data.query.search && data.query.search.length > 0) {
                    // ดึงชื่อไฟล์ภาพจากผลลัพธ์แรก
                    const fileName = data.query.search[0].title.replace('File:', '');
                    
                    // ตรวจสอบความเกี่ยวข้องของรูปภาพ
                    if (fileName.toLowerCase().includes(englishName.toLowerCase()) || 
                        englishName.toLowerCase().includes(fileName.toLowerCase()) ||
                        searchTerm.toLowerCase().includes(fileName.toLowerCase())) {
                        // สร้าง URL สำหรับรูปภาพ (ดึงข้อมูล URL จริงของรูปภาพ)
                        const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
                        
                        const imageResponse = await fetch(imageInfoUrl);
                        const imageData = await imageResponse.json();
                        
                        // ดึง URL ของรูปภาพ
                        const pages = imageData.query.pages;
                        const pageId = Object.keys(pages)[0];
                        
                        if (pages[pageId].imageinfo && pages[pageId].imageinfo.length > 0) {
                            console.log(`Found image for ${placeName} using search term: ${searchTerm}`);
                            return pages[pageId].imageinfo[0].url;
                        }
                    }
                }
            }
            
            // หากไม่พบรูปภาพในทุกคำค้นหา ให้ใช้รูปภาพตัวอย่าง
            console.log(`No image found for ${placeName}`);
            return `https://f.ptcdn.info/187/024/000/1412581961-PantipPatr-o.jpg`;
        } catch (error) {
            console.error("Error fetching Wikimedia image:", error);
            // กรณีเกิดข้อผิดพลาด ให้ใช้รูปภาพตัวอย่าง
            return `https://f.ptcdn.info/187/024/000/1412581961-PantipPatr-o.jpg`;
        }
    }

    // เก็บรูปภาพที่ใช้แล้วเพื่อป้องกันการซ้ำซ้อน
    const usedImages = new Set();

    // สร้าง prompt เพื่อขอคำแนะนำจาก OpenAI แบบเป็นกันเองมากขึ้น
    const prompt = `
    สวัสดี! ฉันกำลังหาที่เที่ยวสนุกๆ ในเมืองไทยอยู่พอดีเลย✨

    วันนี้ฉันรู้สึก${translatedData.emotional_id}มากๆ เลยอยากออกไปเที่ยวเปลี่ยนบรรยากาศสักหน่อย ตอนนี้ฉันอยู่ที่พิกัด ละติจูด ${data.latitude}, ลองจิจูด ${data.longitude} และอยากออกไปเที่ยวแบบ${translatedData.trip_id} ซึ่งฉันไม่อยากไปไกลมาก อยากไปในระยะ${translatedData.distance_id} ด้วยงบประมาณ${translatedData.value_id} ที่มีอยู่

    ฉันชอบที่เที่ยวแนว${translatedData.location_interest_id} และมองหากิจกรรมแบบ${translatedData.activity_id} เป็นพิเศษ

    ช่วยแนะนำ 5 สถานที่ที่คิดว่าเหมาะกับฉันที่สุดในตอนนี้หน่อยได้มั้ย? แต่ช่วยตอบแบบมีข้อมูลให้ฉันครบถ้วนเลยนะ ทั้งชื่อสถานที่ รายละเอียดน่าสนใจ ที่ตั้ง วันและเวลาเปิด-ปิด รวมถึงระยะทางจากฉันด้วย 

    อ้อ! และเพื่อให้ฉันจัดการข้อมูลง่ายขึ้น ช่วยจัดรูปแบบให้เป็นแบบนี้นะ:

    ชื่อสถานที่ (event_name): [ชื่อ]
    รายละเอียดสั้นๆ (event_description): [ข้อมูลสั้นๆ ที่น่าสนใจ]
    ที่ตั้ง (results_location): [สถานที่ตั้ง]
    วันเปิด (open_day): [วันที่เปิดให้บริการ]
    เวลาเปิด-ปิด (time_schedule): [เวลาทำการ]
    ระยะทางจากฉัน (distance): [ระยะทางโดยประมาณ]

    (แล้วก็ช่วยเว้นบรรทัดระหว่างแต่ละสถานที่ด้วยนะ)

    แนะนำมา 5 ที่เท่านั้นนะ ไม่มากกว่าหรือน้อยกว่า และฉันขอเฉพาะสถานที่ในประเทศไทยที่อยู่ในระยะทางที่ฉันบอกไว้เท่านั้น และช่วยตอบเฉพาะข้อมูลตามรูปแบบด้านบนนะ ไม่ต้องเกริ่นนำหรือสรุปอะไรเพิ่มเติม ขอบคุณมากๆ เลย! 🙏💕
    `;
    console.log("Prompt sent to OpenAI:", prompt); // ตรวจสอบ prompt ที่ส่งไป

    try {
        // เรียกใช้ OpenAI API
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 5000
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
        const results = [];
        
        // แก้ไขรูปแบบการแยกวิเคราะห์ให้แม่นยำขึ้น
        for (let i = 0; i < Math.min(recommendations.length, 5); i++) {
            const rec = recommendations[i];
            const placeInfo = {};
            
            // แยกข้อมูลแต่ละบรรทัดด้วยวิธีที่แม่นยำกว่า
            const lines = rec.split('\n');
            
            // ประมวลผลแต่ละบรรทัด
            for (const line of lines) {
                // ใช้ regex เพื่อแยกชื่อฟิลด์และค่า
                const match = line.match(/^(.+?)\s*:\s*(.+)$/);
                if (match) {
                    const fullField = match[1].trim();
                    const value = match[2].trim();
                    
                    // แยกชื่อฟิลด์จากวงเล็บ
                    const fieldMatch = fullField.match(/^(.+?)\s*\((.+?)\)$/);
                    if (fieldMatch) {
                        const fieldName = fieldMatch[2]; // เช่น event_name, event_description
                        placeInfo[fieldName] = value;
                    }
                }
            }
            
            // หากไม่พบชื่อสถานที่ จัดการข้อมูลตามแบบเดิม
            if (!placeInfo.event_name) {
                console.log("ไม่พบรูปแบบที่ถูกต้อง สำหรับสถานที่ที่", i + 1, "ข้อมูล:", rec);
                
                // ใช้วิธีการเดิมเป็น fallback
                const eventName = lines[0]?.split(': ')[1]?.trim();
                const eventDescription = lines[1]?.split(': ')[1]?.trim();
                const resultsLocation = lines[2]?.split(': ')[1]?.trim();
                const openDay = lines[3]?.split(': ')[1]?.trim();
                const timeSchedule = lines[4]?.split(': ')[1]?.trim();
                const distance = lines[5]?.split(': ')[1]?.trim();
                
                // ใส่ข้อมูลที่ได้กลับเข้าไปใน placeInfo
                if (eventName) placeInfo.event_name = eventName;
                if (eventDescription) placeInfo.event_description = eventDescription;
                if (resultsLocation) placeInfo.results_location = resultsLocation;
                if (openDay) placeInfo.open_day = openDay;
                if (timeSchedule) placeInfo.time_schedule = timeSchedule;
                if (distance) placeInfo.distance = distance;
            }
            
            // ตรวจสอบว่ายังมีข้อมูลไม่ครบหรือไม่ และใส่ค่าเริ่มต้น
            const eventName = placeInfo.event_name || "";
            const eventDescription = placeInfo.event_description || "ไม่มีรายละเอียด";
            const resultsLocation = placeInfo.results_location || "ไม่ระบุที่ตั้ง";
            const openDay = placeInfo.open_day || "เปิดบริการทุกวัน";
            const timeSchedule = placeInfo.time_schedule || "10:00-22:00";
            const distance = placeInfo.distance || translatedData.distance_id;
            
            // ตรวจสอบว่ามีชื่อสถานที่หรือไม่
            if (!eventName || eventName === "") {
                console.log(`สถานที่ที่ ${i + 1} ไม่มีชื่อ ข้าม...`);
                continue; // ข้ามสถานที่ที่ไม่มีชื่อ
            }

            // ดึงรูปภาพจาก Wikimedia API โดยใช้ชื่อสถานที่
            let resultsImgUrl = await getWikimediaImage(eventName);
            
            // ตรวจสอบว่ารูปภาพนี้ถูกใช้แล้วหรือไม่
            let attemptCount = 0;
            while (usedImages.has(resultsImgUrl) && attemptCount < 3) {
                console.log(`Image duplicate detected for ${eventName}, trying alternative...`);
                // ลองค้นหาอีกครั้งโดยเพิ่มคำอื่นๆ
                resultsImgUrl = await getWikimediaImage(eventName + " attraction " + attemptCount);
                attemptCount++;
            }
            
            // เพิ่มรูปภาพที่ใช้แล้วเข้าไปในเซต
            usedImages.add(resultsImgUrl);
    
            // กำหนดข้อมูลแต่ละสถานที่
            results.push({
                results_id: i + 1,
                event_name: eventName, // ใช้ชื่อจริงที่ได้จาก AI
                event_description: eventDescription,
                open_day: openDay,
                time_schedule: timeSchedule,
                results_location: resultsLocation,
                results_img_url: resultsImgUrl,
                distance: distance
            });
        }

        // ตรวจสอบว่าได้ข้อมูลอย่างน้อย 1 สถานที่
        if (results.length === 0) {
            console.error("ไม่พบข้อมูลสถานที่ที่ถูกต้องจาก API");
            throw new Error("Invalid place data format received from OpenAI API");
        }

        // จำกัดให้มีเฉพาะ 5 สถานที่
        if (results.length > 5) {
            results.splice(5); // ตัดให้เหลือเพียง 5 สถานที่
        }
        
        // ล็อกข้อมูลก่อนส่งกลับ เพื่อตรวจสอบ
        console.log("Final results:", JSON.stringify(results, null, 2));
        
        return results;
    } catch (error) {
        console.error("Error fetching recommendations:", error);
        throw error;
    }
}

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
    try {
        const query = `
            SELECT
                qa_transaction.qa_transaction_id,
                qa_transaction.account_id,
                qa_traveling.traveling_choice,
                qa_distance.distance_km,
                qa_value.value_money,
                qa_picture.theme AS location_interest,
                GROUP_CONCAT(qa_activity.activity_name ORDER BY qa_activity.activity_name) AS activity_interest,
                qa_emotional.emotional_name,
                qa_transaction.longitude,
                qa_transaction.latitude
            FROM qa_transaction
            LEFT JOIN qa_traveling ON qa_transaction.trip_id = qa_traveling.traveling_id
            LEFT JOIN qa_distance ON qa_transaction.distance_id = qa_distance.distance_id
            LEFT JOIN qa_picture ON qa_transaction.location_interest_id = qa_picture.picture_id
            LEFT JOIN qa_activity 
                ON FIND_IN_SET(qa_activity.activity_id, REPLACE(REPLACE(qa_transaction.activity_id, '[', ''), ']', ''))
            LEFT JOIN qa_emotional ON qa_transaction.emotional_id = qa_emotional.emotional_id
            LEFT JOIN qa_value ON qa_transaction.value_id = qa_value.value_id
            GROUP BY
                qa_transaction.qa_transaction_id,
                qa_transaction.account_id,
                qa_traveling.traveling_choice,
                qa_distance.distance_km,
                qa_value.value_money,
                qa_picture.theme,
                qa_emotional.emotional_name,
                qa_transaction.longitude,
                qa_transaction.latitude;
        `;

        const results = await sequelize.query(query, {
            type: Sequelize.QueryTypes.SELECT
        });

        res.json({ success: true, data: results });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ success: false, error: "Database query failed" });
    }
});


// ✅บันทึกข้อมูลคำตอบของ QA จาก User
app.post('/qa_transaction', async (req, res) => {
    const transaction = await sequelize.transaction(); // Use transaction for the initial query
    try {
        console.log("🟢 Start Transaction");

        const { latitude, longitude, trip_id, distance_id, value_id, location_interest_id, activity_id, emotional_id } = req.body;

        if (!latitude || !longitude || !trip_id || !distance_id || !value_id || !location_interest_id || !Array.isArray(activity_id), !emotional_id) {
            return res.status(400).json({ success: false, message: "Missing or invalid required fields." });
        }

        console.log("🟢 Data validated:", req.body);

        const activityInterestJSON = JSON.stringify(activity_id);
        let account_id = 0;

        // ✅ Insert the main transaction data
        const sql = `
            INSERT INTO qa_transaction (account_id, latitude, longitude, trip_id, distance_id, value_id, location_interest_id, activity_id, emotional_id) 
            VALUES (:account_id, :latitude, :longitude, :trip_id, :distance_id, :value_id, :location_interest_id, :activity_id, :emotional_id)
        `;

        const [result] = await sequelize.query(sql, {
            replacements: { account_id, latitude, longitude, trip_id, distance_id, value_id, location_interest_id, activity_id: activityInterestJSON, emotional_id },
            type: Sequelize.QueryTypes.INSERT,
            transaction
        });

        if (result) {
            account_id = result; // Get the account_id from the insert result

            // ✅ Update account_id in transaction
            const updateSql = `UPDATE qa_transaction SET account_id = :account_id WHERE qa_transaction_id = :qa_transaction_id`;
            await sequelize.query(updateSql, {
                replacements: { account_id, qa_transaction_id: account_id },
                type: Sequelize.QueryTypes.UPDATE,
                transaction
            });

            // ✅ Commit the transaction for the main transaction insertion
            await transaction.commit();
            console.log("Transaction committed.");

            // ✅ Now, handle OpenAI results separately
            try {
                const openAIResults = await getRecommendedPlaces({
                    latitude,
                    longitude,
                    trip_id,
                    distance_id,
                    value_id,
                    location_interest_id,
                    activity_id,
                    emotional_id
                });

                // You can use a separate transaction here if you want to keep the OpenAI results atomic
                const newTransaction = await sequelize.transaction();

                try {
                    await saveResultsToDb(openAIResults, account_id, newTransaction);
                    await newTransaction.commit(); // Commit the new transaction for OpenAI results
                    console.log("OpenAI results saved and transaction committed.");
                } catch (aiError) {
                    console.error("Error saving OpenAI results:", aiError);
                    await newTransaction.rollback(); // Rollback if OpenAI processing fails
                }

            } catch (aiError) {
                console.error("OpenAI processing error:", aiError);
            }

            // ✅ Send the response
            res.json({
                success: true,
                message: "Transaction saved and account_id updated successfully!",
                data: { account_id, latitude, longitude, trip_id, distance_id, value_id, location_interest_id, activity_id, emotional_id}
            });
        } else {
            await transaction.rollback(); // Rollback if the main transaction fails
            res.status(500).json({ success: false, message: "Failed to save transaction." });
        }

    } catch (error) {
        await transaction.rollback();
        console.error("Error saving transaction:", error);
        res.status(500).json({ success: false, error: "Internal server error." });
    }
});

// ✅ดึงข้อมูล qa_results
app.get('/qa_results', async (req, res) => {
    try {
        const query = `SELECT * FROM qa_results`;

        // ใช้ async/await และ QueryTypes.SELECT
        const results = await sequelize.query(query, { type: Sequelize.QueryTypes.SELECT });

        res.json(results);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Database query failed" });
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