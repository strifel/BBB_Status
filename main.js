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

let users = 0;
let meetings = 0;
let serverCount = 0;
let cpu = 0.0;
let issues = [];

function load() {
    fetch(userUrl)
        .then(res => res.text())
        .then((data) => {
            meetings = (data.match(/meetingID/g) || []).length / 2;
            users = (data.match(/userID/g) || []).length / 2;
    });
    fetch("https://api.hetzner.cloud/v1/servers?label_selector=bbb",
        {'headers':
                {'Authorization': 'Bearer ' + hetznerToken}
        }
    ).then(res => res.json()).then((data) => {
        serverCount = 0;
        cpu = 0;
        data['servers'].forEach((d) => {
            serverCount++;
            fetch('https://api.hetzner.cloud/v1/servers/' + d.id + '/metrics?type=cpu&start=' + new Date().toISOString() + '&end=' + new Date().toISOString(),
                {'headers':
                        {'Authorization': 'Bearer ' + hetznerToken}
                }).then(res => res.json()).then((data) => {
                    cpu += data.metrics.time_series.cpu.values[0][1];
            });
        });
    });

}

function renderPage(res) {
    res.render('index.twig', {
        users: users,
        meetings: meetings,
        servers: serverCount,
        alerts: issues,
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

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})

setInterval(load, 5 * 60 * 1000)
load();
