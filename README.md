# BBB Status
Display the status of you're BBB installation in a user-friendly way.
This integrates with the BBB server to get the count of users and with the 
Hetzner Cloud API to get server status.
## Configure
Create a .env
```
BS_USER_URL=https://bbb.example.com/bigbluebutton/api/getMeetings?checksum=Youre_Checksum
BS_HETZNER_TOKEN=
BS_STATUS_TOKEN=
```

The user URL can be calculated or generated with [APIMate](https://mconf.github.io/api-mate/).
The Hetzner Token can be just a simple read only token.
All server have to have the tag bbb.
The status token should be a random generated token.
## Add a status
```
curl -X POST -H "Authorization: Bearer YOUR_STATUS_TOKEN" -H "Content-Type: application/json" --data '{"status": "Youre status message!"}' http://localhost:3000
```
