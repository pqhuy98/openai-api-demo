import * as dotenv from 'dotenv';
dotenv.config()

import { Configuration, OpenAIApi } from 'openai';
import fs from 'fs';

const openai = new OpenAIApi(new Configuration({
    apiKey: process.env.OPENAI_API_KEY
}));

const prompt = `
heart with flowers coming out of it gothic
`


try {
    const response = await openai.createImageEdit(
        fs.createReadStream(`C:\\Users\\Huy Pham\\Downloads\\input.png`),
        "A person holding a massive fecal",
        fs.createReadStream(`C:\\Users\\Huy Pham\\Downloads\\input-mask.png`),
        2,
        "1024x1024"
    );

    // const response = await openai.createImage({
    //     prompt,
    //     n: 2,
    //     size: "1024x1024",
    // });
    let urls = response.data.data.map((d) => d.url);
    console.log(urls);
} catch (error) {
    if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
    } else {
        console.log(error.message);
    }
}