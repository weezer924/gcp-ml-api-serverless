import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as speech from '@google-cloud/speech'

admin.initializeApp(functions.config().firebase);

export const speechToTextFunc = functions.https.onRequest((request, response) => {
  const param: string = request.query.fileName;
  if(!param) {
    console.error('ERROR: fileName is null.');
    response.send(400).end();
  }

  // 音声ファイルの設定
  const payload = {
    config: {
      // WAV, 44100
      encoding: 'AMR',
      sampleRateHertz: 8000,
      languageCode: 'ja-JP'
    },
    audio: {
      uri: '[STORAGE_NAME]' + param
    }
  }

  // SPEECH API
  const client = new speech.SpeechClient();
  client.longRunningRecognize(payload).then(data => {
    const res = data[0];
    console.log('Res is promise');
    return res.promise();
  }).then(data => {
    const res = data[0];
    const transcription = res.results.map(result => result.alternatives[0].transcript).join('\n');
    console.log('Trascription finished! Try to write DB');
    const ref = admin.firestore().collection('orgText').doc(param).set({name: param, text: transcription})
    .then(() => {
      console.log('Document successfully written!');
      response.send(200).end();
    });
  }).catch(err => {
    console.error('ERROR:', err);
    response.send(err).end();
  });
});
