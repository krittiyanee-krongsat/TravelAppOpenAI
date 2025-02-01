const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const OpenAI = require("openai");
const app = express();

app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY,
});

app.get('/api/v1/QA_transaction', async (req, res) => {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {"role": "user", "content": "ฉันชอบอาหาร แนะนำสถานที่หน่อย"}
            ],
            max_tokens: 300,
        });

        res.json({
            success: true,
            message: completion.choices[0].message.content
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}/api/v1/QA_transaction`);
});

    

