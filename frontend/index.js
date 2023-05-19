// periodically make API calls to localhost:3001/activity to get the activity variable and render it on the screen

setInterval(() => {
    fetch("/api/activity")
        .then(res => res.text())
        .then(text => {
            document.getElementById("app").innerText = JSON.stringify(JSON.parse(text), null, 2);
        })
}, 250);
