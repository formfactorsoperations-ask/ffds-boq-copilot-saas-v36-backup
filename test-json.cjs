fetch('http://localhost:3000').then(async r => {
    try {
        await r.json();
    } catch(e) {
        console.log("JSON parse failed");
        const t = await r.text();
        console.log("Text:", t);
    }
}).catch(e => console.error("Outer error:", e.message));
