import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as speech from '@google-cloud/speech'

admin.initializeApp();

export const speechToTextFunc = functions.https.onRequest((request, response) => {
  const param: string = request.query.fileName;
  if(!param) {
    response.send().end();
  }

  const client = new speech.SpeechClient();

  // AMR ファイルの認識
  const payload = {
    config: {
      encoding: 'AMR',
      sampleRateHertz: 8000,
      languageCode: 'ja-JP'
    },
    audio: {
      uri: 'gs://forrest-school.appspot.com/voices/' + param
    }

    // config: {
    //   encoding: 'WAV',
    //   sampleRateHertz: 44100,
    //   languageCode: 'ja-JP'
    // },
    // audio: {
    //   uri: 'gs://forrest-school.appspot.com/voices/oki.WAV'
    // }
  }

  // パス保存する際に拡張子はいらない
  const filePath = param.replace('.amr', '');

  client.recognize(payload).then(data => {
    const res = data[0];
    const transcription = res.results.map(result => result.alternatives[0].transcript).join('\n');
    console.log('Transcription: ', transcription);

    const ref = admin.database().ref().child('orgText/').child(filePath).set({text: transcription}, error => {
      if (error) {
        console.log('Data could not be saved.' + error);
        response.send(transcription).end();
      } else {
        response.send(transcription).end();
      }
    });
  }).catch(err => {
    console.error('ERROR:', err);
    response.send(err).end();
  });
});
