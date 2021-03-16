const express = require('express')
const app = express();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const got = require('got');

const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'))

io.on('connection', client => {
    if (io.engine.clientsCount > 1) {
        client.emit('userConnected')
    }
    
    client.broadcast.emit('userConnected')

    client.on('pause', () => { 
        client.broadcast.emit("pause");
    });

    client.on('play', () => { 
        client.broadcast.emit("play");
    });

    client.on('playing', () => { 
        client.broadcast.emit("playing");
    });

    client.on('setAddress', (address) => {
        io.emit("setAddress", address)
    })

    client.on('loadstart', () => {
        client.broadcast.emit("loadstart");
    })

    client.on('progress', () => {
        client.broadcast.emit("progress")
    })

    client.on('waiting', () => {
        client.broadcast.emit("waiting")
    })

    client.on('loadedmetadata', () => {
        client.broadcast.emit("loadedmetadata");
    })

    client.on('loadeddata', () => {
        client.broadcast.emit("loadeddata");
    })

    client.on('seeking', (time) => {
        client.broadcast.emit("seeking", time);
    })

    client.on('seeked', () => {
        client.broadcast.emit("seeked");
    })

    client.on('downloadFile', (url) => {
        download(url, './public/videos/downloaded.mp4', (err) => {
            io.emit('serverError', err)
        }, () => {
            io.emit('setAddress', '/video?video=video.mp4')
        }, (progress) => {
            io.emit('downloadProgress', progress + '%')
        })
    })
});

io.on('disconnect', () => {
    io.broadcast.emit('userDisconnected')
})

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/public/index.html");
});

app.get("/video", function (req, res) {
  // get video name
  const videoName = req.query.video

  // Ensure there is a range given for the video
  const range = req.headers.range;
  if (!range) {
    res.status(400).send("Requires Range header");
  }

  // get video stats (about 61MB)
  const videoPath = `./public/videos/${videoName}`;
  const videoSize = fs.statSync(videoPath).size;

  // Parse Range
  // Example: "bytes=32324-"
  const CHUNK_SIZE = 10 ** 6; // 1MB
  const start = Number(range.replace(/\D/g, ""));
  const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

  // Create headers
  const contentLength = end - start + 1;
  const headers = {
    "Content-Range": `bytes ${start}-${end}/${videoSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": contentLength,
    "Content-Type": "video/mp4",
  };

  // HTTP Status 206 for Partial Content
  res.writeHead(206, headers);

  // create video read stream for this particular chunk
  const videoStream = fs.createReadStream(videoPath, { start, end });

  // Stream the video chunk to the client
  videoStream.pipe(res);
});

server.listen(3000, '0.0.0.0');


function download (url, filepath, onError, onDone, onProgress) {
    const downloadStream = got.stream(url);
    const fileWriterStream = fs.createWriteStream(filepath);

    downloadStream
    .on("downloadProgress", ({ transferred, total, percent }) => {
        const percentage = Math.round(percent * 100);

        onProgress(percentage)
    }).on("error", (error) => {
        onError(`Download failed: ${error.message}`);
    });

    fileWriterStream.on("error", (error) => {
        onError(`Could not write file to system: ${error.message}`)
    }).on("finish", () => {
        onDone()
    });

    downloadStream.pipe(fileWriterStream);
}
