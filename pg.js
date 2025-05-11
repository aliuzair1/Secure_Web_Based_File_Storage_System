const {Client} = require("pg");
require("dotenv").config();
const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    password: process.env.DB_PASSWORD
})

client.connect()
.then (()=> {console.log(`connected to pg`)})
.catch(()=>{
    console.log(`cant connect to pg`)
})

module.exports={client}