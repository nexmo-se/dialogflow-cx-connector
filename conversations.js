'use strict'

require('dotenv').config();

//---- Dialogflow CX

const googleAppCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const projectId = process.env.GCLOUD_PROJECT_ID;
const location = process.env.DF_AGENT_LOCATION;
const agentId = process.env.DF_AGENT_ID;
const environment = process.env.DF_ENVIRONMENT;
const language = process.env.DF_LANGUAGE;

const dfApiServer = location + '-dialogflow.googleapis.com';

const {SessionsClient} = require('@google-cloud/dialogflow-cx');

const encoding = 'AUDIO_ENCODING_LINEAR_16'; // NEVER modify
const sampleRateHertz = 16000; // NEVER modify
const outputEncoding = 'OUTPUT_AUDIO_ENCODING_LINEAR_16'; // NEVER modify

const STREAM_TIMEOUT_SEC = 290;

//-----------------

class Conversation {
  
  constructor(original_uuid) {
    this.init = this.init.bind(this);
    this.isWritingAudioStream = true;
    this.analyzeContentStream = null;
    this.streamingTimer = null;
    this.originalCallUuid = '_call_uuid_' + original_uuid; // voice call type conversation
  }

  //-- original call uuid xxx...xxx is passed to Dialogflow as "call_uuid_xxx...xxx"
  async init() {
    try {
      console.log('>>> init this.originalCallUuid: ', this.originalCallUuid, ' for credentials at: ', googleAppCredentials);
      console.log("*#*#*#*# GCloud ID in conversation: " + projectId);
      this.sessionClient = new SessionsClient({apiEndpoint: dfApiServer});
      console.log("Got sessionClient...");
      // this.sessionPath = this.sessionClient.projectLocationAgentSessionPath(projectId, location, agentId, environment, this.originalCallUuid);
      this.sessionPath = this.sessionClient.projectLocationAgentSessionPath(projectId, location, agentId, this.originalCallUuid);
    } catch (error) {
      console.log(" Conversation error caught: ");
      console.log(error);
    }
  }

  //--------

  startStreamingTimer(callBackFunction) {
    var _this = this;

    this.streamingTimer = setInterval(function () {
      _this.restartStream(callBackFunction)
    }, 1000 * STREAM_TIMEOUT_SEC)

    _this.restartStream(callBackFunction)
  }

  //--------

  stopStreamingTimer() {
    clearInterval(this.streamingTimer)
  }

  //---------

  startAnalyzeStream(callBackFunction) {
    console.log("startAnalyzeStream")

    let request = {
      session: this.sessionPath,
      queryInput: {
        audio: {
          config: {
            audioEncoding: encoding,
            sampleRateHertz: sampleRateHertz,
            singleUtterance: true
          },
          // audio: audioReqPayload  
        },  
        languageCode: language
      },
      outputAudioConfig: {
        audioEncoding: outputEncoding,
        sampleRateHertz: sampleRateHertz
      }
    };

    this.analyzeContentStream = this.sessionClient.streamingDetectIntent()
    this.isWritingAudioStream = true
    this.analyzeContentStream.on('data', (response) => {

      if (response.recognitionResult) {
        if (response.recognitionResult.messageType == 'END_OF_SINGLE_UTTERANCE'
          || response.recognitionResult.isFinal) {
          this.stopStreamingTimer()
          this.startStreamingTimer(callBackFunction)
        }

      }
      else {
        callBackFunction(response);
      };

    })

    this.analyzeContentStream.on('error', (err) => {
      console.error('-------');
      console.error(err);
      console.error('-------');
    });

    this.analyzeContentStream.on('finish', (res) => {
      console.log('stream_closed');
    });

    this.analyzeContentStream.write(request);
    return this.analyzeContentStream;
  }

  //---------

  tryEndAudioStream() {
    this.isWritingAudioStream = false;
    if (this.analyzeContentStream) {
      this.analyzeContentStream.end();
      this.analyzeContentStream = null;
    }
    clearTimeout(this.streamingTimer);
  }

  //---------

  restartStream(callBackFunction) {
    this.tryEndAudioStream();
    this.startAnalyzeStream(callBackFunction)
  }

  //---------

  sendMessage(msg) {
    if (this.isWritingAudioStream && this.analyzeContentStream) {
      // this.analyzeContentStream.write({ inputAudio: msg });
      this.analyzeContentStream.write({queryInput: {audio: {audio: msg}}});
    }
  }

  //---------

  closeConversation() {
    this.tryEndAudioStream()
  }

}

//--------

module.exports = Conversation;
