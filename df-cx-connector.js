'use strict'

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser')
const app = express();
const expressWs = require('express-ws')(app);
const request = require('request');

const reqHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

//-------

const Conversation = require('./conversations');

//------- sentiment analysis

const language = require('@google-cloud/language');  // for sentiment analysis
const client = new language.LanguageServiceClient();

// ------- this server port

const port = process.env.PORT || 6000;

//==========================================================

app.use(bodyParser.json());

//---- CORS policy - update to your requirements

// app.use(function (req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
//   res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
//   next();
// });

//-----------------------------------------

// This WebSocket receives the caller spoken audio,
// It connects to DialogFlow using the Dialogflow node SDK
// It will play back the bot audio response through the WebSocket

app.ws('/socket', async (ws, req) => {

  const date = new Date().toLocaleString();
  console.log("DialogFlow WebSocket call at " + date);
  
  const uuid = req.query.original_uuid;
  const vapiAppUrl = 'https://' + req.query.vapi_app_host + '/analytics';
  const analyzeSentiment = req.query.analyze_sentiment;

  function reqCallback(error, response, body) {
      if (body != "Ok") {  
        console.log("Webhook call status to VAPI application:", body);
      };  
  }
  
  let conversation = new Conversation(uuid);

  await conversation.init();

  let callback = async function (response) {
    
    try {
      
      const timerIds = app.get(`playtimers_${uuid}`) || [];
      for (const timerId of timerIds) {
        clearTimeout(timerId);
      };

      // console.log(">>> response:", response);

      if ( response.detectIntentResponse.outputAudio.byteLength > 0 ) {

        console.log(">>> Playback in progress for websocket:", uuid);
        
        // Send Dialogflow audio response to caller via websocket
        console.log("Sending back audio bytes:", response.detectIntentResponse.outputAudio.byteLength);
        const replyAudio = response.detectIntentResponse.outputAudio;

        // const frames = replyAudio.length / 640;
        // let pos = 0;
        // const timerIds = [];

        // remove wav header (44-byte long)
        const frames = (replyAudio.length - 44) / 640;
        let pos = 44;
        const timerIds = [];
    
        // play Dialogflow audio through WebSocket    
        for (let i = 0; i < frames + 1; i++) {
          const newpos = pos + 640;
          const data = replyAudio.slice(pos, newpos);
          
          timerIds.push(setTimeout(function () {
            if (ws.readyState === 1) {  // Send data only if websocket is up
              ws.send(data);
            }
          }, i * 20))  // Send a frame every 20 ms
          
          pos = newpos;
        }

        app.set(`playtimers_${uuid}`, timerIds);

      }
    } catch (e) {
      console.log("Websocket resonse error:", e);
    }
  
    if (response.responseId != '') {

      // console.log(">>> responseMessages:", response.detectIntentResponse.queryResult.responseMessages);

      console.log(">>> transcript:", response.detectIntentResponse.queryResult.transcript);

      console.log(">>> response text:", response.detectIntentResponse.queryResult.responseMessages[0].text.text[0]);

      // const queryText = response.detectIntentResponse.queryResult.queryText;

      // uncomment for sentiment analysis

      // let sentimentScore = "Request text is empty or sentiment analysis is not requested";
      // if (queryText != "" && analyzeSentiment == "true") {
      //   const [sentiment] = await analyzeSentimentOfText(queryText);
      //   sentimentScore = sentiment.documentSentiment.score;
      // }

      // const docSentiment = sentiment.documentSentiment;
      // console.log(`Document sentiment:`);
      // console.log(`  Score: ${docSentiment.score}`);
      // console.log(`  Magnitude: ${docSentiment.magnitude}`);

      // const sentences = sentiment.sentences;
      // console.log('Sentences: ', sentences);
      // sentences.forEach(sentence => {
      //   console.log(`Sentence: ${sentence.text.content}`);
      //   console.log(`  Score: ${sentence.sentiment.score}`);
      //   console.log(`  Magnitude: ${sentence.sentiment.magnitude}`);
      // });

      // const result = {
      //   'uuid': uuid,
      //   'queryText': queryText,
      //   'fulfillmentText': response.detectIntentResponse.queryResult.fulfillmentText,
      //   'sentiment': sentimentScore,
      //   'allRequiredParamsPresent': response.queryResult.allRequiredParamsPresent,
      //   'action': response.queryResult.action,
      //   'intent': response.queryResult.intent.displayName,
      // };     

      // console.log("result:", JSON.stringify(result));

      // let Reqoptions = {
      //   url: vapiAppUrl,
      //   method: 'POST',
      //   headers: reqHeaders,
      //   body: JSON.stringify(result)
      // };

      // request(Reqoptions, reqCallback);
    }

  };

  conversation.startStreamingTimer(callback);

  ws.on('message', (msg) => {
    
    if (typeof msg === "string") {
      let config = JSON.parse(msg);
      console.log(">>> Message:", msg);
    }
    else {
      conversation.sendMessage(msg);
    }

  });

  ws.on('close', () => {
    
    console.log(">>> Websocket closed");
    conversation.closeConversation();
  
  })

})

//----------

async function analyzeSentimentOfText(text) {
  // [START language_sentiment_text]
  // Imports the Google Cloud client library
  // const language = require('@google-cloud/language');

  // Creates a client
  // const client = new language.LanguageServiceClient();

  // const text = 'Hello, world!';

  // Prepares a document, representing the provided text
  const document = {
    content: text,
    type: 'PLAIN_TEXT',
  };

  // Detects the sentiment of the document
  const [result] = await client.analyzeSentiment({document});

  // const sentiment = result.documentSentiment;
  // console.log(`Document sentiment:`);
  // console.log(`  Score: ${sentiment.score}`);
  // console.log(`  Magnitude: ${sentiment.magnitude}`);

  // const sentences = result.sentences;
  
  // console.log('Sentences: ', sentences);

  // sentences.forEach(sentence => {
  //   console.log(`Sentence: ${sentence.text.content}`);
  //   console.log(`  Score: ${sentence.sentiment.score}`);
  //   console.log(`  Magnitude: ${sentence.sentiment.magnitude}`);
  // });

  return [result];
} 

//----------

app.use('/', express.static(__dirname));

//-----------

app.listen(port, () => console.log(`Server application listening on port ${port}!`));

//------------
