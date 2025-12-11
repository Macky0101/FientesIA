// App.js
import React, { useEffect, useState } from 'react';
import {
    SafeAreaView,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Alert,
    Platform,
} from 'react-native';

import * as DocumentPicker from 'expo-document-picker';
import RNFS from 'react-native-fs';
import { NativeModules } from 'react-native';

const { HybridModule } = NativeModules;

export default function App() {
    const [modelLoaded, setModelLoaded] = useState(false);
    const [loadingModel, setLoadingModel] = useState(false);
    const [selectedUri, setSelectedUri] = useState(null);
    const [sequencePreview, setSequencePreview] = useState(null);
    const [inferenceLoading, setInferenceLoading] = useState(false);
    const [results, setResults] = useState(null);

    // Tes fichiers modèle dans android/app/src/main/assets/
    const MODEL_FILE = "poultry_monitor_model.tflite";
    const SCALER_FILE = "scaler_params.json";
    const CONFIG_FILE = "app_config.json";

    // Charger modèle au lancement
    useEffect(() => {
        (async () => {
            try {
                setLoadingModel(true);
                const res = await HybridModule.loadModel(
                    MODEL_FILE,
                    SCALER_FILE,
                    CONFIG_FILE
                );
                console.log("Model loaded:", res);
                setModelLoaded(true);
            } catch (err) {
                console.error("Erreur loadModel:", err);
                Alert.alert("Erreur", "Impossible de charger le modèle.");
            } finally {
                setLoadingModel(false);
            }
        })();
    }, []);

    // --- Sélection du fichier JSON ---
    async function pickJsonFile() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: "application/json",
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            // Le fichier se trouve dans result.assets[0]
            const asset = result.assets?.[0];
            if (!asset || !asset.uri) {
                Alert.alert("Erreur", "Impossible de récupérer l'URI du fichier.");
                return;
            }

            const uri = asset.uri;
            setSelectedUri(uri);
            setResults(null);

            // Lire le fichier JSON sélectionné
            const filePath = uri.startsWith("file://")
                ? uri.replace("file://", "")
                : uri;

            const content = await RNFS.readFile(filePath, "utf8");
            setSequencePreview(truncatePreview(content));
        } catch (err) {
            console.error(err);
            Alert.alert("Erreur", "Impossible de lire le fichier JSON.");
        }
    }


    function truncatePreview(text) {
        try {
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
                return `Tableau JSON, length=${data.length}\nPrévisualisation:\n` +
                    JSON.stringify(data[0], null, 2).slice(0, 1200);
            } else if (data.sequence) {
                return `Objet avec 'sequence', length=${data.sequence.length}\nPrévisualisation:\n` +
                    JSON.stringify(data.sequence[0], null, 2).slice(0, 1200);
            }
            return text.slice(0, 1200);
        } catch (e) {
            return text.slice(0, 1200);
        }
    }

    // --- Inférence ---
    async function handleClassify() {
        if (!modelLoaded) {
            Alert.alert("Modèle non chargé !");
            return;
        }
        if (!selectedUri) {
            Alert.alert("Aucun fichier JSON sélectionné !");
            return;
        }

        try {
            setInferenceLoading(true);

            const res = await HybridModule.classifySequenceFromUri(selectedUri);
            console.log("Résultat brut:", res);

            setResults(res);
        } catch (err) {
            console.error("Erreur inference:", err);
            Alert.alert("Erreur", "L'inférence a échoué.");
        } finally {
            setInferenceLoading(false);
        }
    }

    // --- Affichage des résultats par horizon ---
    function renderGrouped(resultsArray) {
        const group = {
            "1h": resultsArray.slice(0, 4),
            "6h": resultsArray.slice(4, 8),
            "24h": resultsArray.slice(8, 12),
        };

        return (
            <View>
                {Object.entries(group).map(([horizon, arr]) => (
                    <View key={horizon} style={styles.horizonBox}>
                        <Text style={styles.horizonTitle}>Prévision à {horizon}</Text>
                        {arr.map((r, i) => (
                            <View key={i} style={styles.row}>
                                <Text style={styles.label}>{r.label}</Text>
                                <Text style={styles.value}>{Number(r.value).toFixed(3)}</Text>
                            </View>
                        ))}
                    </View>
                ))}
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Poultry Monitor – CNN-BiLSTM-Attention</Text>

                <View style={styles.section}>
                    <Text style={styles.label}>État du modèle :</Text>
                    {loadingModel ? (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <ActivityIndicator />
                            <Text style={{ marginLeft: 8 }}>Chargement...</Text>
                        </View>
                    ) : (
                        <Text
                            style={{
                                color: modelLoaded ? "green" : "red",
                                fontWeight: "700",
                            }}
                        >
                            {modelLoaded ? "Modèle chargé ✓" : "Modèle non chargé ✗"}
                        </Text>
                    )}
                </View>

                <View style={styles.section}>
                    <TouchableOpacity style={styles.btn} onPress={pickJsonFile}>
                        <Text style={styles.btnText}>📂 Sélectionner JSON</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Aperçu :</Text>
                    <View style={styles.preview}>
                        <Text style={{ color: "#444" }}>
                            {sequencePreview || "Aucun fichier"}
                        </Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: "#2a9d8f" }]}
                        onPress={handleClassify}
                        disabled={!selectedUri || !modelLoaded || inferenceLoading}
                    >
                        <Text style={styles.btnText}>🚀 Lancer Inférence</Text>
                    </TouchableOpacity>
                </View>

                {inferenceLoading && <ActivityIndicator size="large" />}

                {results && (
                    <View style={styles.section}>
                        <Text style={styles.label}>Résultats :</Text>
                        {renderGrouped(results)}
                    </View>
                )}

                <View style={{ height: 30 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#fff" },
    container: { padding: 20 },
    title: { fontSize: 22, fontWeight: "900", marginBottom: 14, color: "#333" },
    section: { marginVertical: 10 },
    label: { fontWeight: "700", marginBottom: 6 },
    btn: {
        backgroundColor: "#264653",
        padding: 12,
        borderRadius: 10,
        alignItems: "center",
    },
    btnText: { color: "#fff", fontWeight: "700" },
    preview: {
        borderWidth: 1,
        borderColor: "#ddd",
        padding: 10,
        minHeight: 80,
        borderRadius: 8,
        backgroundColor: "#fafafa",
    },
    horizonBox: {
        backgroundColor: "#f5f5f5",
        padding: 12,
        borderRadius: 10,
        marginVertical: 8,
    },
    horizonTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderColor: "#eee",
    },
    value: { fontWeight: "800" },
});
