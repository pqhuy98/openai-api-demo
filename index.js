import * as dotenv from 'dotenv';
dotenv.config()

import screenshotDesktop from "screenshot-desktop";
import fs from "fs";
import tesseract from "node-tesseract-ocr";
import { Configuration, OpenAIApi } from 'openai';
import express from "express";
import cors from "cors";
import levenshtein from 'js-levenshtein';
import Jimp from 'jimp';
import activeWindow from 'active-win';
import bodyParser from 'body-parser';

const openai = new OpenAIApi(new Configuration({
    apiKey: process.env.OPENAI_API_KEY
}));

var prediction = "", result = {}, cost = 0, prevImg = null, time0 = Date.now();
var prevText = "";

const SYSTEM_MESSAGE = `Predict the user's current activity based on the active window's name and title, and visible strings in their screenshot, and respond with a sentence starting with "The user..." describing their most probable main activity, ignoring other less likely activities.`


async function predictExpensive(text) {
    const resp = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        temperature: 0.2,
        messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            { role: "user", content: text }
        ],
    });
    console.log("tokens:", resp.data.usage.total_tokens);
    return {
        output: resp.data.choices[0].message.content,
        cost: resp.data.usage.total_tokens * 0.002 / 1000,
        tokens: resp.data.usage.total_tokens,
    };
}

async function predictCheap(input) {
    let prompt = `
        ### Instruction ###
        ${SYSTEM_MESSAGE}

        ### Input ###
        ${input}

        ### Prediction ###
        The user`

    const resp = await openai.createCompletion({
        model: "babbage",
        prompt: prompt,
    });
    return {
        output: resp.data.choices[0].text,
        cost: resp.data.usage.total_tokens * 0.002 / 1000,
        tokens: resp.data.usage.total_tokens,
    }
    return;
}

var requests60s = [];
var requests = [];

async function captureAndPredict() {
    let now = Date.now();

    // Active window
    let windows = await activeWindow.getOpenWindows({});
    let mainWindow = windows[0];
    let winInfo = `
        Active window: ${mainWindow.owner.name}: ${mainWindow.title}
        Other inactive windows: ${windows.slice(1)
            .map(win => win.owner.name + ": " + win.title)
            .join("; ")}`;

    // Captured strings
    let img = await screenshotDesktop();
    let text = await tesseract.recognize(img, {
        oem: 1,
        psm: 3,
    });
    text = text.replaceAll("\n", " ");
    text = text.replaceAll("\r", " ");
    let words = text.split(" ").filter(word => word.length > 1 && word.match(/[a-z]/i));
    text = words.join(" ");

    // Input
    let input = `
        ${winInfo}
        Captured strings: ${text} `;

    // Prediction
    let textDistance = prevText ? levenshtein(text, prevText) : 9999;
    prevText = text;
    let jimg = await Jimp.read(img)
    let imgDistance = prevImg ? Jimp.distance(jimg, prevImg) : 9999;
    prevImg = jimg;
    let newActivityDetected = imgDistance >= 0.1 || textDistance > 0.6 * text.length;
    if (newActivityDetected) {
        const resp = await predictExpensive(input);
        fs.writeFileSync("predictions.txt", `${new Date().toISOString()} - ${resp.output}\n`, { flag: "a" });
        prediction = `(${resp.tokens}) ${resp.output} `;
        cost += resp.cost;

        requests.push(now);
        requests60s.push(now);
    }
    requests60s = requests60s.filter(timestamp => timestamp > Date.now() - 1000 * 60);
    result = {
        textDistanceRatio: textDistance / text.length,
        imgDistance,
        requestsAll: requests.length,
        requests60s: requests60s.length,
        cost,
        runDuration: new Date(Date.now() - time0).toISOString().substr(11, 8),
        prediction,
    };

    console.log(now, result);
    if (newActivityDetected) {
        fs.mkdirSync("output/" + now, { recursive: true });
        fs.writeFileSync("output/" + now + "/input.txt", input);
        fs.writeFileSync("output/" + now + "/screenshot.png", img);
        fs.writeFileSync("output/" + now + "/response.txt", prediction);
    }
}

async function loop() {
    while (true) {
        try {
            await captureAndPredict();
            // await sleep(1000);
        } catch (error) {
            console.log(error)
        }
    }
}
// loop();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// create express server that serves a GET /activity endpoint to return the activity variable
const app = express();
app.use(cors());
// app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));

app.use(express.static('frontend'));
app.get("/api/activity", (req, res) => {
    res.send(result);
});

// create a route to receive POST /api/generate requests, returns the image with the transparent areas filled in black
app.post("/api/generate", async (req, res) => {
    let { mask, original, prompt } = req.body;
    console.log("Prompt:", prompt);

    let maskBuffer = Buffer.from(mask.split(",")[1], 'base64');
    let originalBuffer = Buffer.from(original.split(",")[1], 'base64');
    // get width and height of the image
    let img = await Jimp.read(originalBuffer);
    let width = img.getWidth();
    let height = img.getHeight();

    maskBuffer.name = "mask.png";
    originalBuffer.name = "original.png";

    try {
        // call OpenAI API to edit the image from the mask and the prompt.
        // The prompt is the text the user entered in the text box.
        const response = await openai.createImageEdit(
            originalBuffer,
            prompt,
            maskBuffer,
            1,
            "1024x1024"
        );
        let url = response.data.data[0].url;

        // load the image from URL and return base64 encoded image
        let img = await Jimp.read(url);
        img.resize(width, height);
        let base64 = await img.getBase64Async(Jimp.MIME_PNG);
        res.send({ image: base64 });
    } catch (error) {
        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }
        res.status(500).send(error.message);
    }
});

// API to load the image from URL and return the image as raw
app.get("/api/image/:url", async (req, res) => {
    let url = req.params.url;
    let img = await Jimp.read(url);

    // crop img to square
    if (img.getWidth() > img.getHeight()) {
        img.crop((img.getWidth() - img.getHeight()) / 2, 0, img.getHeight(), img.getHeight());
    } else {
        img.crop(0, (img.getHeight() - img.getWidth()) / 2, img.getWidth(), img.getWidth());
    }

    // resize img so that no dimension is larger than 1024
    if (img.getWidth() > 1024 || img.getHeight() > 1024) {
        img.resize(1024, 1024);
    }

    let buffer = await img.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
});

app.listen(3001);

