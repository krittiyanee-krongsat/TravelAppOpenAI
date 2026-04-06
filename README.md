# 🤖 Nextrip — OpenAI Service

A Node.js service that analyzes user preferences and recommends travel destinations in Thailand using **GPT-4o (OpenAI)** and fetches place images from the **Wikimedia API**.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MySQL (mysql2) |
| AI Model | GPT-4o (OpenAI) |
| Image Source | Wikimedia API |
| API Docs | Swagger UI |

---

## 📁 Project Structure

```
TRAVELAPPOPENAI/
├── .env
├── .gitignore
├── main.js
├── package.json
├── package-lock.json
└── swagger.yaml
```

---

## ✅ Prerequisites
 
Make sure you have **Node.js** installed on your machine.
 
```bash
node -v
```
 
> If Node.js is not installed, download it at: [https://nodejs.org](https://nodejs.org)
 
---
 
## 🚀 Getting Started
 
### 1. Install dependencies
 
```bash
npm install
```
 
### 2. Create `.env` file
 
```env
OPEN_AI_KEY=your_openai_api_key
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
PORT=3000
```
 
### 3. Run the server
 
```bash
nodemon main.js
```
 
> Server runs at `http://localhost:3000`  
> Swagger UI is available at `http://localhost:3000/api-docs`
 
---
 
## 🔄 API Endpoints
 
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/qa_transaction` | Retrieve all records from qa_transaction |
| POST | `/qa_transaction` | Submit user data → process with GPT-4o → save results to qa_results |
| GET | `/qa_results` | Retrieve all recommended place results |
 
---
 
## 📨 Request Body (POST `/qa_transaction`)
 
```json
{
  "latitude": 13.7563,
  "longitude": 100.5018,
  "trip_id": 1,
  "distance_id": 2,
  "value_id": 2,
  "location_interest_id": 3,
  "activity_id": [1, 2],
  "emotional_id": 2
}
```
 
---
 
## 🤖 AI Flow
 
```
1. Receive user input (POST /qa_transaction)
2. Translate numeric IDs to text (e.g. trip_id: 1 → "Solo trip")
3. Build a prompt and send it to GPT-4o
4. Parse the response into 5 recommended places
5. Fetch place images from Wikimedia API
6. Save results to qa_results table
```
 
---

## 📸 Screenshots
<img width="300" height="300" alt="ภาพตัวอย่าง UI" src="https://github.com/user-attachments/assets/9d60d376-5de3-4967-a7d5-0319471334af" />
<img width="300" height="300" alt="ภาพตัวอย่าง UI (2)" src="https://github.com/user-attachments/assets/599cd6b7-9e83-491e-8635-3c3cc54857d9" />
<img width="300" height="300" alt="ภาพตัวอย่าง UI (3)" src="https://github.com/user-attachments/assets/dded37b7-eb55-4103-a6ce-c48f6b0aaed9" />
<img width="300" height="300" alt="ภาพตัวอย่าง UI (4)" src="https://github.com/user-attachments/assets/f96fe998-4d2f-44b9-b770-f10965d6bf3a" />
<img width="300" height="300" alt="ภาพตัวอย่าง UI (5)" src="https://github.com/user-attachments/assets/166b46b7-4bc5-4e82-ab81-236fdbad1d06" />
