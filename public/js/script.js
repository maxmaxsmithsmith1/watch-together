const socket = io("/")

const videoDOM = document.getElementById("videoJS")
const statusElement = document.getElementById('statusElement')
const connectivityElement = document.getElementById('connectivityElement')
const setAddressButtonElement = document.getElementById('setAddressButton')
const downloadStatusElement = document.getElementById('downloadStatus')
const cancelDownloadButton = document.getElementById('cancelDownloadButton')

const setStatus = text => { statusElement.innerText = text }
const setConnectivityStatus = text => { connectivityElement.innerText = text }
const setDownloadStatus = text => { downloadStatusElement.innerText = text }
const disableSetAddressButtonElement = () => setAddressButtonElement.disabled = true
const enableSetAddressButtonElement = () => setAddressButtonElement.disabled = false
const disableCancelDownloadButtonElement = () => cancelDownloadButton.disabled = true
const enableCancelDownloadButtonElement = () => cancelDownloadButton.disabled = false
const disableVideo = () => videoDOM.controls = false
const enableVideo = () => videoDOM.controls = true
const reloadVideo = () => videoDOM.load()

let ignoreSeekingEmit = false
let ignorePauseEmit = false
let ignorePlayEmit = false

// DOM listeners
setAddressButtonElement.addEventListener('click', function () {
    const address = document.getElementById('downloadAddressInput').value

    if (address) {
        disableSetAddressButtonElement()

        socket.emit('downloadFile', address)
    }
}, false)

cancelDownloadButton.addEventListener('click', function () {
    socket.emit('cancelDownload')
}, false)

// video events
videoDOM.onpause = function () {
    if (!ignorePauseEmit) {
        console.log('pause')
        socket.emit('pause')
        socket.emit('seeking', videoDOM.currentTime)
    }

    ignorePauseEmit = false
}

videoDOM.onplaying = function () {
    if (!ignorePlayEmit) {
        console.log('playing')
        socket.emit('playing')
    }

    ignorePlayEmit = false
}

videoDOM.onseeking = function () {
    if (!ignoreSeekingEmit) {
        console.log('seeking')
        socket.emit('seeking', videoDOM.currentTime)
    }

    ignoreSeekingEmit = false
}

videoDOM.onwaiting = function () {
    console.log('waiting')
    if (videoDOM.paused) socket.emit('waiting')
}

// socket
socket.on('setAddress', function () {
    reloadVideo()
})

socket.on('pause', function () {
    console.log('pause')

    ignorePauseEmit = true

    videoDOM.pause()
})

socket.on('playing', function () {
    console.log('playing')

    ignorePlayEmit = true

    videoDOM.play()

    enableVideo()

    setStatus('Loadeed')
})

socket.on('seeking', function (time) {
    ignoreSeekingEmit = true

    videoDOM.currentTime = time
})

socket.on('waiting', function () {
    setStatus('wait for other user please!')

    disableVideo()
})

socket.on('userConnected', function () {
    enableVideo()

    setConnectivityStatus('ONLINE')
})

socket.on('userDisconnected', function () {
    videoDOM.pause()

    disableVideo()

    setConnectivityStatus('OFFLINE')
})

socket.on('downloadProgress', function (content) {
    setDownloadStatus(content)
})

socket.on('serverError', function (err) {
    console.err('server error', err)
})

socket.on('serverLog', function (log) {
    console.err('server Log', log)
})

socket.on('isServerDownloading', function (isDownloading) {
    if (isDownloading) {
        disableSetAddressButtonElement()
        enableCancelDownloadButtonElement()
    } else {
        enableSetAddressButtonElement()
        disableCancelDownloadButtonElement()
    }
})

// add file uploader
const uploader = new SocketIOFileUpload(socket);

uploader.listenOnInput(document.getElementById("siofu_input"));

uploader.addEventListener("complete", function(){
    document.getElementById('subtitleUploadStatus').innerText = "SUCCESSFUL"
});

uploader.addEventListener("error", function(){
    console.error('error')
});
