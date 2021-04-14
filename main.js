const express = require('express')
const fetch = require('node-fetch');
const Twig = require("twig")
require('dotenv').config()

const app = express();
app.use(express.json());

const port = process.env.BS_PORT || 3000
const userUrl = process.env.BS_USER_URL
const hetznerToken = process.env.BS_HETZNER_TOKEN;
const statusToken = process.env.BS_STATUS_TOKEN;
const zulipToken = process.env.BS_ZULIP_TOKEN;
const highCPUAlert = process.env.BS_HIGH_CPU_ALERT || "{{server}} has a high CPU usage. If you experience problems on it, try recreating your Meeting.";

let users = 0;
let meetings = 0;
let serverCount = 0;
let cpu = 0.0;
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
        serverCount = 0;
        cpu = 0;
        alerts = [];
        data['servers'].forEach((d) => {
            serverCount++;
            fetch('https://api.hetzner.cloud/v1/servers/' + d.id + '/metrics?type=cpu&start=' + new Date().toISOString() + '&end=' + new Date().toISOString(),
                {'headers':
                        {'Authorization': 'Bearer ' + hetznerToken}
                }).then(res => res.json()).then((data) => {
                    let serverCPU = data.metrics.time_series.cpu.values[0][1];
                    cpu = parseFloat(cpu) + parseFloat(serverCPU);
                    if (serverCPU > 700) {
                        alerts.push(highCPUAlert.replace("{{server}}", d.name))
                    }
            });
        });
    });

}

function renderPage(res) {
    res.render('index.twig', {
        users: users,
        meetings: meetings,
        servers: serverCount,
        issues: issues,
        alerts: alerts,
        cpu: (parseFloat(cpu) / (serverCount * 8)).toFixed(0)
    });
}

app.get('/', (req, res) => {
    renderPage(res);
})

app.post('/', (req, res) => {
    if (req.header("Authorization") === "Bearer " + statusToken) {
        if ('status' in req.body) {
            issues.push({status: req.body.status, time: new Date().toLocaleTimeString()});
        } else {
            issues = [];
        }
    }
    renderPage(res);
})

app.post('/refresh', (req, res) => {
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

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})

setInterval(load, 5 * 60 * 1000)
load();
