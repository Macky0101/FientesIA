// App.js
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Button,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  ScrollView,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { NativeModules } from 'react-native';

const { TFLiteModule } = NativeModules;

export default function App() {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [inferenceLoading, setInferenceLoading] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    // Charger le modèle au démarrage
    (async () => {
      try {
        setLoadingModel(true);
        // charge le modèle depuis assets
        const res = await TFLiteModule.loadModel(
          "mobilenetv2_float16.tflite",
          "labels.txt"
        );
        console.log('loadModel res', res);
        setModelLoaded(true);
      } catch (err) {
        console.error('Erreur loadModel', err);
        Alert.alert('Erreur', 'Impossible de charger le modèle : ' + (err?.message || err));
      } finally {
        setLoadingModel(false);
      }
    })();
  }, []);

  async function requestAndroidPermissions() {
    try {
      const cameraGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: "Permission caméra",
          message: "L'application a besoin d'accéder à la caméra pour prendre des photos.",
          buttonPositive: "OK",
        }
      );
      const storageGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: "Permission stockage",
          message: "L'application a besoin d'accéder aux images pour choisir depuis la galerie.",
          buttonPositive: "OK",
        }
      );

      return (
        cameraGranted === PermissionsAndroid.RESULTS.GRANTED &&
        storageGranted === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn(err);
      return false;
    }
  }

  async function handleTakePhoto() {
    if (Platform.OS === 'android') {
      const ok = await requestAndroidPermissions();
      if (!ok) {
        Alert.alert('Permissions requises', 'Active les permissions caméra et stockage.');
        return;
      }
    }

    launchCamera(
      {
        mediaType: 'photo',
        cameraType: 'back',
        quality: 0.9,
        saveToPhotos: true,
      },
      (response) => {
        if (response.didCancel) return;
        if (response.errorCode) {
          console.error('Camera error', response);
          Alert.alert('Erreur caméra', response.errorMessage || response.errorCode);
          return;
        }
        if (response.assets && response.assets.length > 0) {
          const uri = response.assets[0].uri;
          setImageUri(uri);
          setResults(null);
        }
      }
    );
  }

  async function handlePickImage() {
    if (Platform.OS === 'android') {
      const ok = await requestAndroidPermissions();
      if (!ok) {
        Alert.alert('Permissions requises', 'Active les permissions de stockage.');
        return;
      }
    }

    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.9,
      },
      (response) => {
        if (response.didCancel) return;
        if (response.errorCode) {
          console.error('ImagePicker error', response);
          Alert.alert('Erreur', response.errorMessage || response.errorCode);
          return;
        }
        if (response.assets && response.assets.length > 0) {
          const uri = response.assets[0].uri;
          setImageUri(uri);
          setResults(null);
        }
      }
    );
  }

  async function handleClassify() {
    if (!modelLoaded) {
      Alert.alert('Modèle non chargé', 'Patiente le chargement du modèle.');
      return;
    }
    if (!imageUri) {
      Alert.alert('Aucune image', 'Sélectionne ou prends une photo d\'abord.');
      return;
    }

    try {
      setInferenceLoading(true);
      setResults(null);

      // Appel du module natif - classifyImage attend un URI (content://... ou file://...)
      const res = await TFLiteModule.classifyImage(imageUri);
      // res est un array [{ label: 'cocci', probability: 0.97 }, ...]
      // On va trier par probabilité décroissante et garder top 3
      const sorted = Array.isArray(res) ? res.sort((a, b) => b.probability - a.probability) : [];
      setResults(sorted.slice(0, 3));
    } catch (err) {
      console.error('inference error', err);
      Alert.alert('Erreur', 'Échec de l\'inférence : ' + (err?.message || err));
    } finally {
      setInferenceLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>FientesAI — MobileNetV2 (224×224)</Text>

        <View style={styles.section}>
          <Text style={styles.label}>État du modèle :</Text>
          {loadingModel ? (
            <View style={styles.row}>
              <ActivityIndicator />
              <Text style={{ marginLeft: 8 }}>Chargement du modèle...</Text>
            </View>
          ) : (
            <Text style={{ color: modelLoaded ? 'green' : 'red', fontWeight: '700' }}>
              {modelLoaded ? 'Modèle chargé ✅' : 'Modèle non chargé ❌'}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Image :</Text>
          <View style={styles.buttonsRow}>
            <TouchableOpacity style={styles.btn} onPress={handlePickImage}>
              <Text style={styles.btnText}>Galerie</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={handleTakePhoto}>
              <Text style={styles.btnText}>Caméra</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#2a9d8f' }]}
              onPress={handleClassify}
              disabled={!imageUri || !modelLoaded || inferenceLoading}
            >
              <Text style={styles.btnText}>Classifier</Text>
            </TouchableOpacity>
          </View>
        </View>

        {imageUri ? (
          <View style={styles.preview}>
            <Image source={{ uri: imageUri }} style={styles.image} />
          </View>
        ) : (
          <View style={styles.previewEmpty}>
            <Text style={{ color: '#666' }}>Aucune image sélectionnée</Text>
          </View>
        )}

        <View style={styles.section}>
          {inferenceLoading && <ActivityIndicator size="large" />}

          {results && (
            <View>
              <Text style={styles.label}>Résultats (Top 3):</Text>
              {results.map((r, i) => (
                <View key={i} style={styles.resultRow}>
                  <Text style={styles.resultLabel}>{r.label}</Text>
                  <Text style={styles.resultValue}>{(r.probability * 100).toFixed(2)}%</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
        <Text style={styles.note}>Note: MobileNetV2 Float16 attend des images 224×224 RGB normalisées (x-127.5)/127.5. Teste en conditions réelles sur appareil.</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  section: { marginVertical: 10 },
  label: { fontWeight: '700', marginBottom: 8 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { backgroundColor: '#264653', padding: 10, borderRadius: 8, minWidth: 90, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  preview: { marginTop: 12, alignItems: 'center' },
  previewEmpty: { height: 250, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eee', borderRadius: 8 },
  image: { width: 250, height: 250, borderRadius: 6 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderColor: '#ddd' },
  resultLabel: { fontWeight: '700' },
  resultValue: { fontWeight: '800' },
  note: { color: '#666', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center' }
});
