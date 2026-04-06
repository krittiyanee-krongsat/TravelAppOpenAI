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
