import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function test() {
    try {
        const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });
        const result = await model.generateContent("Oi");
        console.log(result.response.text());
    } catch (e) {
        console.error(e);
    }
}
test();
