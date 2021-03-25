const express = require('express')
const app = express();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const got = require('got');
const server = require('http').createServer(app);
const siofu = require("socketio-file-upload");
const srt2vtt = require('srt-to-vtt');
const URL = require("url");
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let isDownloading = false;
let downloadStream = null;

// stream
// Readable Streams Storage Class
class FileReadStreams {
    constructor() {
      this._streams = {};
    }
    
    make(file, options = null) {
      return options ?
        fs.createReadStream(file, options)
        : fs.createReadStream(file);
    }
    
    get(file) {
      return this._streams[file] || this.set(file);
    }
    
    set(file) {
      return this._streams[file] = this.make(file);
    }
  }
  const readStreams = new FileReadStreams();
  
  // Getting file stats and caching it to avoid disk i/o
  function getFileStat(file, callback) {
      fs.stat(file, function(err, stat) {
        if(err) {
          return callback(err);
        }
        
        callback(null, stat);
      });
  }
  
  // Streaming whole file
  function streamFile(file, req, res) {
    getFileStat(file, function(err, stat) {
      if(err) {
        console.error(err);
        return res.status(404).end();
      }
      
      let bufferSize = 1024 * 1024;
      res.writeHead(200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': 0,
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size
      });
      readStreams.make(file, {bufferSize}).pipe(res);
    });
  }
  
  // Streaming chunk
  function streamFileChunked(file, req, res) {
    getFileStat(file, function(err, stat) {
      if(err) {
        console.error(err);
        return res.status(404).end();
      }
      
      let chunkSize = 1024 * 1024;
      if(stat.size > chunkSize * 2) {
        chunkSize = Math.ceil(stat.size * 0.25);
      }
      let range = (req.headers.range) ? req.headers.range.replace(/bytes=/, "").split("-") : [];
      
      range[0] = range[0] ? parseInt(range[0], 10) : 0;
      range[1] = range[1] ? parseInt(range[1], 10) : range[0] + chunkSize;
      if(range[1] > stat.size - 1) {
        range[1] = stat.size - 1;
      }
      range = {start: range[0], end: range[1]};
      
      let stream = readStreams.make(file, range);
      res.writeHead(206, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': 0,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + stat.size,
        'Content-Length': range.end - range.start + 1,
      });
      stream.pipe(res);
    });
  }
  
// end of stream

app.use(siofu.router).use(express.static('public'))

io.on('connection', client => {
    const uploader = new siofu();
    uploader.dir = './public/videos';
    uploader.listen(client);

    uploader.on('saved', (event) => {
        // convert and remove original file
        const filePathName = event.file.pathName
        const readStream = fs.createReadStream(filePathName)
        readStream.pipe(srt2vtt())
            .pipe(fs.createWriteStream('./public/videos/downloaded.vtt'))

        readStream
            .on('end', function () {
                fs.unlink(filePathName, console.error)
            })
    })

    uploader.on('error', (data) => {
        console.error(data)
    })

    if (io.engine.clientsCount > 1) {
        client.emit('userConnected')
    }

    client.emit('isServerDownloading', isDownloading);

    client.broadcast.emit('userConnected');

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
        isDownloading = true;

        io.emit('isServerDownloading', isDownloading);

        var parsed = URL.parse(url);
        const fileName = path.basename(parsed.pathname)

        // remove previous video
        const filesName = fs.readdirSync('./public/videos/').filter(file => {
            return file.includes('.mp4') || file.includes('.mkv')
        });
    
        const deletePath = './public/videos/' + filesName[0];
        fs.unlink(deletePath, console.error);

        downloadStream = download(url, './public/videos/' + fileName, (err) => {
            io.emit('serverError', err)

            isDownloading = false;

            io.emit('isServerDownloading', isDownloading);
        }, () => {
            io.emit('setAddress', '/video')

            isDownloading = false;

            io.emit('isServerDownloading', isDownloading);
        }, (progress) => {
            io.emit('downloadProgress', progress + '%')
        })
    })

    client.on('cancelDownload', () => {
        if (downloadStream) {
            isDownloading = false;
            downloadStream.destroy();
            downloadStream = false;

            io.emit('isServerDownloading', isDownloading);
        }
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
    const files = fs.readdirSync('./public/videos/').filter(file => {
        return file.includes('.mp4') || file.includes('.mkv')
    });

    const filePath = './public/videos/' + files[0]

    if(/firefox/i.test(req.headers['user-agent'])) {
        return streamFile(filePath, req, res);
    }

    streamFileChunked(filePath, req, res);
});

server.listen(3000, '0.0.0.0');

function download(url, filepath, onError, onDone, onProgress) {
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

    return downloadStream
}


