/*
Write a website that supports inputting an image URL. The website loads the URL and allows the user to mark different areas of the image as transparent. The image should be displayed on the canvas with id "original". The canvas with id "transparent" is where the user can draw their mouse, areas of 50 radius drawn on this canvas should be transparent on the original image. The user should be able to save the image with the transparent areas to their computer.
*/
const canvas2 = document.getElementById('transparent');
const ctx2 = canvas2.getContext('2d');
const canvas3 = document.getElementById('output');
const ctx3 = canvas3.getContext('2d');

// initially the generate button is disabled
document.getElementById('generate').disabled = true;

const originalImg = new Image();
originalImg.setAttribute('crossorigin', 'anonymous');

const img = new Image();
img.setAttribute('crossorigin', 'anonymous');

img.onload = function () {
    // reenable generate button
    document.getElementById('generate').disabled = false;

    // resize canvas to match image size
    canvas2.width = img.width;
    canvas2.height = img.height;
    ctx2.drawImage(img, 0, 0);
    ctx3.clearRect(0, 0, canvas3.width, canvas3.height);
}
let isDrawing = false;
let x = 0;
let y = 0;
let radius = 50;
let color = 'rgba(0,0,0,0)';

function clearCircle(x, y, r) {
    for (var i = 0; i < Math.round(Math.PI * r); i++) {
        var angle = (i / Math.round(Math.PI * r)) * 360;
        ctx2.clearRect(x, y, Math.sin(angle * (Math.PI / 180)) * r, Math.cos(angle * (Math.PI / 180)) * r);
    }
}

function draw(e) {
    if (!isDrawing) return;
    var mouseX = e.offsetX * canvas2.width / canvas2.clientWidth | 0;
    var mouseY = e.offsetY * canvas2.height / canvas2.clientHeight | 0;

    clearCircle(mouseX, mouseY, radius);
}

canvas2.addEventListener('mousedown', (e) => {
    // only run if left mouse button is pressed
    let button = e.button;
    if (button != 0) return;
    isDrawing = true;
    draw(e);
}
);
canvas2.addEventListener('mousemove', draw);
canvas2.addEventListener('mouseup', () => isDrawing = false);
canvas2.addEventListener('mouseout', () => isDrawing = false);

// create a button to reset the canvas2 back to the original image
document.getElementById('reset').addEventListener('click', () => {
    img.src = "http://localhost:3001/api/image/" + encodeURIComponent(document.getElementById('url').value);
    originalImg.src = img.src;
    ctx2.drawImage(img, 0, 0);
});

// clicking the generate button will send the image in canvas2 to the server's API as JSON. The API returns another image with the transparent areas filled in. This image should be displayed on the canvas with id "output".
document.getElementById('generate').addEventListener('click', () => {
    // make reset and generate buttons unclickable
    document.getElementById('reset').disabled = true;
    document.getElementById('generate').disabled = true;


    // value of generate button counts down from 25 to 0
    let count = 25;
    document.getElementById('generate').innerText = "Generating (~" + count + ")...";
    let interval = setInterval(() => {
        count = Math.max(0, count - 1);
        document.getElementById('generate').innerText = "Generating (~" + count + "s)...";
    }, 1000);


    let dataURL = canvas2.toDataURL("image/png");
    let originalDataURL = getBase64Image(originalImg);

    let data = {
        original: originalDataURL,
        mask: dataURL,
        prompt: document.getElementById('prompt').value,
    };

    fetch("/api/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data),
    })
        .then(res => res.json())
        .then(data => {
            let img = new Image();
            img.src = data.image;
            img.setAttribute('crossorigin', 'anonymous');
            img.onload = function () {
                // resize canvas to match image size
                canvas3.width = img.width;
                canvas3.height = img.height;
                ctx3.drawImage(img, 0, 0);
                // make reset and generate buttons clickable again
                document.getElementById('reset').disabled = false;
                document.getElementById('generate').disabled = false;
                document.getElementById('generate').innerText = "Generate";
                clearInterval(interval);
            }
        });
});


function getBase64Image(img) {
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
}