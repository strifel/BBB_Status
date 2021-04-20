const express = require('express')
const fetch = require('node-fetch');
const Twig = require("twig")
const sanitizer = require('sanitize')();
const WebSocketServer = require("ws").Server;
const http = require("http");

require('dotenv').config()

const app = express();
const server = http.createServer(app)
const wss = new WebSocketServer({server: server, path: "/websocket"});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.BS_PORT || 3000
const userUrl = process.env.BS_USER_URL
const hetznerToken = process.env.BS_HETZNER_TOKEN;
const statusToken = process.env.BS_STATUS_TOKEN;
const zulipToken = process.env.BS_ZULIP_TOKEN;
const slackIssueURI = process.env.BS_SLACK_ISSUE_URL;
const highCPUAlert = process.env.BS_HIGH_CPU_ALERT || "{{server}} has a high CPU usage. If you experience problems on it, try recreating your Meeting.";
const language = process.env.BS_LANGUAGE ? JSON.parse(process.env.BS_LANGUAGE) : {"report": "Report issue", "issue": "issue", "cancel": "cancel", "submit": "submit", "chooseAServer": "Choose a Server"};

let users = 0;
let meetings = 0;
let cpu = 0.0;
let cores = 0;
let servers = [];
let issues = [];
let alerts = [];

function load() {
    fetch(userUrl)
        .then(res => res.text())
        .then((data) => {
            meetings = (data.match(/meetingID/g) || []).length / 2;
            users = (data.match(/userID/g) || []).length / 2;
    });
    fetch("https://api.hetzner.cloud/v1/servers?label_selector=bbb&status=running",
        {'headers':
                {'Authorization': 'Bearer ' + hetznerToken}
        }
    ).then(res => res.json()).then((data) => {
        servers = [];
        cpu = 0;
        cores = 0;
        alerts = [];
        let startDate = new Date();
        startDate = new Date(startDate - 1000 * 60 * 5);

        data['servers'].forEach((d) => {
            servers.push(d);
            cores = parseInt(cores) + parseInt(d.server_type.cores);
            fetch('https://api.hetzner.cloud/v1/servers/' + d.id + '/metrics?type=cpu&start=' + startDate.toISOString() + '&end=' + new Date().toISOString(),
                {'headers':
                        {'Authorization': 'Bearer ' + hetznerToken}
                }).then(res => res.json()).then((data) => {
                    let cpuArray = data.metrics.time_series.cpu.values;
                    let serverCPU = cpuArray.reduce((a, b) => {
                        if (a instanceof Array) a = a[1]
                        return parseFloat(a) + parseFloat(b[1])
                    }) / cpuArray.length;
                    cpu = parseFloat(cpu) + parseFloat(serverCPU);
                    if (serverCPU > (90 * (d.server_type.cores))) {
                        alerts.push(highCPUAlert.replace("{{server}}", d.name))
                    }
            });
            // Yes I do know setTimeout is far from optimal to use here! But I will just put a
            //TODO here and never think of it again!
            setTimeout(() => sendWS(), 5000);
        });
    });

}

function sendWS() {
    wss.clients.forEach((client) => client.send(JSON.stringify(getData())));
}

function renderPage(res) {
    res.render('index.twig', getData());
}

function getData() {
    return {
        users: users,
        meetings: meetings,
        servers: servers.map((d) => d.name),
        serverCount: servers.length,
        issues: issues,
        alerts: alerts,
        cpu: (parseFloat(cpu) / cores).toFixed(0),
        language: language
    };
}

app.get('/', (req, res) => {
    renderPage(res);
})

app.post('/', (req, res) => {
    if ('server' in req.body && 'error' in req.body) {
        let server = sanitizer.primitives(req.body.server);
        server = Object.values(server).join('').replace("```", "");
        let error = sanitizer.primitives(req.body.error);
        error = Object.values(error).join('').replace("```", "");
        fetch(slackIssueURI, {
            'method': 'POST',
            'body': JSON.stringify({'text': "```\n" + server + ": " + error + "\n```"})
        })
    }
    renderPage(res);
});

app.post('/api/issues', (req, res) => {
    if (req.header("Authorization") === "Bearer " + statusToken) {
        if ('status' in req.body) {
            issues.push({status: req.body.status, time: new Date().toLocaleTimeString()});
        } else {
            issues = [];
        }
    }
    res.redirect("/");
})

app.post('/api/refresh', (req, res) => {
    if (req.header("Authorization") === "Bearer " + statusToken) {
        load();
    }
    res.redirect("/");
})

app.post('/zulip', (req, res) => {
   if (zulipToken && req.body && req.body.token && req.body.token === zulipToken) {
       let content = req.body.message.content.replace("@**BBB Status**", "");
       if (content === "clear" || content === " clear") {
           issues = [];
           sendWS();
           res.json({
               "content": "Cleared"
           });
       } else if (content === "refresh" || content === " refresh") {
           load();
           res.json({
               "content": "Refreshed"
           });
       } else {
           issues.push({status: content, time: new Date().toLocaleTimeString()});
           sendWS();
           res.json({
               "content": "+ " + content
           });
       }

   } else {
       res.redirect("/");
   }
});

//404
app.get('*', (req, res) => res.redirect("/"));

app.post('*', (req, res) => res.redirect("/"));

server.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})

setInterval(load, 5 * 60 * 1000)
load();
