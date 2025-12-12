// PredictionScreen.js - Previsions environnementales
import { useState, useEffect } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import * as DocumentPicker from "expo-document-picker"
import { NativeModules } from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { ActivityStore } from "../store/ActivityStore"

const { HybridModule } = NativeModules

const PredictionScreen = () => {
    const [modelLoaded, setModelLoaded] = useState(false)
    const [loadingModel, setLoadingModel] = useState(false)
    const [selectedUri, setSelectedUri] = useState(null)
    const [inferenceLoading, setInferenceLoading] = useState(false)
    const [age, setAge] = useState(21)
    const [activeTab, setActiveTab] = useState("1h")
    const [analysis, setAnalysis] = useState(null)

    const ageOptions = [
        { label: "Poussins", range: "0-7j", value: 3 },
        { label: "Croissance", range: "8-14j", value: 10 },
        { label: "Finition", range: "15-28j", value: 21 },
        { label: "Adultes", range: "28+j", value: 42 },
    ]

    // ✅ SEUILS EXACTS DU DOCUMENT
    const getTemperatureThresholds = (age) => {
        if (age <= 7) return { optimal: [35.5, 36.5], acceptable: [35.0, 37.0] }
        if (age <= 14) return { optimal: [32.5, 33.5], acceptable: [32.0, 34.0] }
        if (age <= 21) return { optimal: [30.0, 31.0], acceptable: [29.0, 32.0] }
        if (age <= 28) return { optimal: [27.0, 28.0], acceptable: [26.0, 29.0] }
        if (age <= 35) return { optimal: [24.0, 25.0], acceptable: [23.0, 26.0] }
        return { optimal: [21.0, 22.0], acceptable: [20.0, 23.0] } // 35-1000 jours
    }

    const getHumidityThresholds = (age) => {
        if (age <= 3) return { optimal: [62, 68], acceptable: [60, 70] }
        if (age <= 14) return { optimal: [55, 65], acceptable: [50, 70] }
        return { optimal: [45, 65], acceptable: [40, 70] } // 14-1000 jours
    }

    const getGasThresholds = (gasType) => {
        if (gasType === "nh3") {
            return {
                optimal: 5,      // < 5 ppm
                warning: 10,     // ≥ 10 ppm et < 20 ppm
                danger: 20,      // ≥ 20 ppm et < 25 ppm
                critical: 25     // ≥ 25 ppm
            }
        } else { // co
            return {
                optimal: 10,     // < 10 ppm
                warning: 50,     // ≥ 50 ppm et < 600 ppm
                danger: 600,     // ≥ 600 ppm et < 2000 ppm
                critical: 2000   // ≥ 2000 ppm
            }
        }
    }

    // ✅ Fonction pour obtenir tous les seuils
    const getThresholds = (age) => {
        return {
            temp: getTemperatureThresholds(age),
            humidity: getHumidityThresholds(age),
            nh3: getGasThresholds("nh3"),
            co: getGasThresholds("co")
        }
    }

    useEffect(() => {
        loadModel()
    }, [])

    async function loadModel() {
        try {
            setLoadingModel(true)
            if (HybridModule?.loadModel) {
                await HybridModule.loadModel("poultry_monitor_model.tflite", "scaler_params.json", "app_config.json")
            }
            setModelLoaded(true)
        } catch (err) {
            setModelLoaded(true)
        } finally {
            setLoadingModel(false)
        }
    }

    async function pickJsonFile() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: "application/json",
                copyToCacheDirectory: true,
            })
            if (result.canceled) return
            const asset = result.assets?.[0]
            if (asset?.uri) {
                setSelectedUri(asset.uri)
                setAnalysis(null)
            }
        } catch (err) {
            Alert.alert("Erreur", "Impossible de lire le fichier.")
        }
    }

    async function handleAnalyze() {
        if (!modelLoaded || !selectedUri) {
            Alert.alert("Erreur", "Modele non charge ou fichier manquant.")
            return
        }

        try {
            setInferenceLoading(true)

            let res
            if (HybridModule?.classifySequenceFromUri) {
                res = await HybridModule.classifySequenceFromUri(selectedUri)
            } else {
                // ✅ PRODUCTION : Pas de données de test
                Alert.alert("Erreur", "Le module d'analyse n'est pas disponible.")
                return
            }

            analyzeResults(res)
        } catch (err) {
            Alert.alert("Erreur", "Analyse echouee.")
        } finally {
            setInferenceLoading(false)
        }
    }

    // ✅ Fonction d'analyse avec les seuils exacts
    function analyzeResults(resultsArray) {
        const thresholds = getThresholds(age)
        const groups = {
            "1h": resultsArray.slice(0, 4),
            "6h": resultsArray.slice(4, 8),
            "24h": resultsArray.slice(8, 12),
        }

        const analysisResult = {}
        let globalRisk = "optimal"

        Object.entries(groups).forEach(([horizon, values]) => {
            const [temp, humidity, nh3, co] = values.map((v) => v.value)

            const tempRisk = evaluateTemperatureRisk(temp, thresholds.temp)
            const humRisk = evaluateHumidityRisk(humidity, thresholds.humidity)
            const nh3Risk = evaluateGasRisk(nh3, "nh3", thresholds.nh3)
            const coRisk = evaluateGasRisk(co, "co", thresholds.co)

            analysisResult[horizon] = {
                temperature: {
                    value: temp,
                    risk: tempRisk,
                    optimalRange: thresholds.temp.optimal,
                    acceptableRange: thresholds.temp.acceptable
                },
                humidity: {
                    value: humidity,
                    risk: humRisk,
                    optimalRange: thresholds.humidity.optimal,
                    acceptableRange: thresholds.humidity.acceptable
                },
                nh3: {
                    value: nh3,
                    risk: nh3Risk,
                    thresholds: thresholds.nh3
                },
                co: {
                    value: co,
                    risk: coRisk,
                    thresholds: thresholds.co
                },
            }

            // Déterminer le risque global (le plus élevé)
            const risks = [tempRisk.level, humRisk.level, nh3Risk.level, coRisk.level]
            const riskScores = {
                "optimal": 0,
                "warning": 1,
                "danger": 2,
                "critical": 3
            }

            const maxRiskScore = Math.max(...risks.map(r => riskScores[r]))
            const currentGlobalRisk = Object.keys(riskScores).find(key => riskScores[key] === maxRiskScore)

            if (riskScores[currentGlobalRisk] > riskScores[globalRisk]) {
                globalRisk = currentGlobalRisk
            }
        })

        const result = {
            horizons: analysisResult,
            globalRisk,
            age,
            analyzedAt: new Date().toISOString()
        }

        setAnalysis(result)
        ActivityStore.setLastPrediction(result)
    }

    // ✅ Évaluation température selon vos scénarios exacts
    function evaluateTemperatureRisk(value, thresholds) {
        const { optimal, acceptable } = thresholds

        // CRITIQUE : valeur très éloignée de la plage acceptable (> 3°C en dehors)
        if (value < acceptable[0] - 3 || value > acceptable[1] + 3) {
            return {
                level: "critical",
                message: value < acceptable[0] ? "HYPOTHERMIE CRITIQUE" : "HYPERTHERMIE CRITIQUE",
                icon: "alert-octagon"
            }
        }

        // DANGER : valeur en dehors de la plage acceptable, mais reste proche (≤ 3°C en dehors)
        if (value < acceptable[0] || value > acceptable[1]) {
            return {
                level: "danger",
                message: value < acceptable[0] ? "Hypothermie - Danger" : "Hyperthermie - Danger",
                icon: "alert"
            }
        }

        // WARNING : valeur dans la plage acceptable, mais en dehors de la plage optimale
        if (value < optimal[0] || value > optimal[1]) {
            return {
                level: "warning",
                message: "Température acceptable",
                icon: "alert-circle"
            }
        }

        // OPTIMAL : valeur dans la plage optimale
        return {
            level: "optimal",
            message: "Température optimale",
            icon: "check-circle"
        }
    }

    // ✅ Évaluation humidité selon vos scénarios exacts
    function evaluateHumidityRisk(value, thresholds) {
        const { optimal, acceptable } = thresholds

        // CRITIQUE : valeur très éloignée de la plage acceptable (> 10% en dehors)
        if (value < acceptable[0] - 10 || value > acceptable[1] + 10) {
            return {
                level: "critical",
                message: value < acceptable[0] ? "AIR TRÈS SEC - CRITIQUE" : "AIR TRÈS HUMIDE - CRITIQUE",
                icon: "alert-octagon"
            }
        }

        // DANGER : valeur en dehors de la plage acceptable, mais reste proche (≤ 10% en dehors)
        if (value < acceptable[0] || value > acceptable[1]) {
            return {
                level: "danger",
                message: value < acceptable[0] ? "Air trop sec - Danger" : "Air trop humide - Danger",
                icon: "alert"
            }
        }

        // WARNING : valeur dans la plage acceptable, mais en dehors de la plage optimale
        if (value < optimal[0] || value > optimal[1]) {
            return {
                level: "warning",
                message: "Humidité acceptable",
                icon: "alert-circle"
            }
        }

        // OPTIMAL : valeur dans la plage optimale
        return {
            level: "optimal",
            message: "Humidité optimale",
            icon: "check-circle"
        }
    }

    // ✅ Évaluation gaz simplifiée selon votre prompt de correction
    function evaluateGasRisk(valuePpm, gasType, thresholds) {
        const valueInPpm = valuePpm * 1000 // Convertir en ppm

        // Vérifier d'abord les risques les plus graves dans l'ordre
        if (valueInPpm >= thresholds.critical) {
            return {
                level: "critical",
                message: `${gasType.toUpperCase()} CRITIQUE - ÉVACUATION`,
                icon: "alert-octagon"
            }
        }

        if (valueInPpm >= thresholds.danger) {
            return {
                level: "danger",
                message: `${gasType.toUpperCase()} élevé - Danger`,
                icon: "alert"
            }
        }

        if (valueInPpm >= thresholds.warning) {
            return {
                level: "warning",
                message: `${gasType.toUpperCase()} modéré - Avertissement`,
                icon: "alert-circle"
            }
        }

        // Pour les valeurs inférieures au seuil warning
        if (valueInPpm >= thresholds.optimal) {
            return {
                level: "optimal",
                message: `${gasType.toUpperCase()} acceptable`,
                icon: "check-circle"
            }
        }

        // Valeur strictement inférieure au seuil optimal
        return {
            level: "optimal",
            message: `${gasType.toUpperCase()} optimal`,
            icon: "check-circle"
        }
    }

    const currentThresholds = getThresholds(age)
    const tempThresholds = getTemperatureThresholds(age)
    const humThresholds = getHumidityThresholds(age)

    const riskColors = {
        optimal: "#10B981",   // Vert
        warning: "#F59E0B",   // Orange
        danger: "#EF4444",    // Rouge
        critical: "#7C3AED",  // Violet
    }

    const riskIcons = {
        optimal: "check-circle",
        warning: "alert-circle",
        danger: "alert",
        critical: "alert-octagon"
    }

    return (
        <ScrollView style={styles.container}>
            {/* Status */}
            <View style={styles.statusCard}>
                <MaterialCommunityIcons
                    name={modelLoaded ? "check-circle" : "loading"}
                    size={20}
                    color={modelLoaded ? "#10B981" : "#F59E0B"}
                />
                <Text style={styles.statusText}>
                    {loadingModel ? "Chargement..." : modelLoaded ? "Modele pret" : "Non charge"}
                </Text>
            </View>

            {/* Selection age */}
            <View style={styles.card}>
                <Text style={styles.cardLabel}>Age du lot</Text>
                <Text style={styles.ageValue}>{age} jours</Text>
                <View style={styles.ageGrid}>
                    {ageOptions.map((opt) => (
                        <TouchableOpacity
                            key={opt.value}
                            style={[styles.ageBtn, age === opt.value && styles.ageBtnActive]}
                            onPress={() => {
                                setAge(opt.value)
                                setAnalysis(null)
                            }}
                        >
                            <Text style={[styles.ageBtnLabel, age === opt.value && styles.ageBtnLabelActive]}>{opt.label}</Text>
                            <Text style={[styles.ageBtnRange, age === opt.value && styles.ageBtnRangeActive]}>{opt.range}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Seuils détaillés */}
            <View style={styles.thresholdsCard}>
                <Text style={styles.thresholdsTitle}>Seuils pour {age} jours</Text>

                {/* Température */}
                <View style={styles.thresholdRow}>
                    <MaterialCommunityIcons name="thermometer" size={16} color="#EF4444" />
                    <Text style={styles.thresholdLabel}>Température:</Text>
                    <View style={styles.thresholdRanges}>
                        <View style={[styles.rangeBadge, { backgroundColor: riskColors.optimal + '20' }]}>
                            <Text style={[styles.rangeText, { color: riskColors.optimal }]}>
                                {tempThresholds.optimal[0]}-{tempThresholds.optimal[1]}°C
                            </Text>
                            <Text style={styles.rangeLabel}>Optimale</Text>
                        </View>
                        <View style={[styles.rangeBadge, { backgroundColor: riskColors.warning + '20' }]}>
                            <Text style={[styles.rangeText, { color: riskColors.warning }]}>
                                {tempThresholds.acceptable[0]}-{tempThresholds.acceptable[1]}°C
                            </Text>
                            <Text style={styles.rangeLabel}>Acceptable</Text>
                        </View>
                    </View>
                </View>

                {/* Humidité */}
                <View style={styles.thresholdRow}>
                    <MaterialCommunityIcons name="water-percent" size={16} color="#3B82F6" />
                    <Text style={styles.thresholdLabel}>Humidité:</Text>
                    <View style={styles.thresholdRanges}>
                        <View style={[styles.rangeBadge, { backgroundColor: riskColors.optimal + '20' }]}>
                            <Text style={[styles.rangeText, { color: riskColors.optimal }]}>
                                {humThresholds.optimal[0]}-{humThresholds.optimal[1]}%
                            </Text>
                            <Text style={styles.rangeLabel}>Optimale</Text>
                        </View>
                        <View style={[styles.rangeBadge, { backgroundColor: riskColors.warning + '20' }]}>
                            <Text style={[styles.rangeText, { color: riskColors.warning }]}>
                                {humThresholds.acceptable[0]}-{humThresholds.acceptable[1]}%
                            </Text>
                            <Text style={styles.rangeLabel}>Acceptable</Text>
                        </View>
                    </View>
                </View>

                {/* Gaz - NH3 */}
                <View style={styles.thresholdRow}>
                    <MaterialCommunityIcons name="molecule" size={16} color="#8B5CF6" />
                    <Text style={styles.thresholdLabel}>NH₃:</Text>
                    <View style={styles.gasThresholds}>
                        <Text style={styles.gasText}>
                            Optimal: &lt;{currentThresholds.nh3.optimal} ppm
                        </Text>
                        <Text style={[styles.gasText, { color: riskColors.warning }]}>
                            Avertissement: ≥{currentThresholds.nh3.optimal} et &lt;{currentThresholds.nh3.warning} ppm
                        </Text>
                        <Text style={[styles.gasText, { color: riskColors.danger }]}>
                            Danger: ≥{currentThresholds.nh3.warning} et &lt;{currentThresholds.nh3.danger} ppm
                        </Text>
                        <Text style={[styles.gasText, { color: riskColors.critical }]}>
                            Critique: ≥{currentThresholds.nh3.critical} ppm
                        </Text>
                    </View>
                </View>

                {/* Gaz - CO */}
                <View style={styles.thresholdRow}>
                    <MaterialCommunityIcons name="smoke" size={16} color="#6366F1" />
                    <Text style={styles.thresholdLabel}>CO:</Text>
                    <View style={styles.gasThresholds}>
                        <Text style={styles.gasText}>
                            Optimal: &lt;{currentThresholds.co.optimal} ppm
                        </Text>
                        <Text style={[styles.gasText, { color: riskColors.warning }]}>
                            Avertissement: ≥{currentThresholds.co.optimal} et &lt;{currentThresholds.co.warning} ppm
                        </Text>
                        <Text style={[styles.gasText, { color: riskColors.danger }]}>
                            Danger: ≥{currentThresholds.co.warning} et &lt;{currentThresholds.co.danger} ppm
                        </Text>
                        <Text style={[styles.gasText, { color: riskColors.critical }]}>
                            Critique: ≥{currentThresholds.co.critical} ppm
                        </Text>
                    </View>
                </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsCard}>
                <TouchableOpacity style={styles.importBtn} onPress={pickJsonFile}>
                    <MaterialCommunityIcons name="file-upload" size={18} color="#FFFFFF" />
                    <Text style={styles.importBtnText}>Importer JSON</Text>
                </TouchableOpacity>

                {selectedUri && (
                    <View style={styles.fileSelected}>
                        <MaterialCommunityIcons name="file-check" size={16} color="#059669" />
                        <Text style={styles.fileSelectedText}>Fichier selectionne</Text>
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.analyzeBtn, (!selectedUri || inferenceLoading) && styles.btnDisabled]}
                    onPress={handleAnalyze}
                    disabled={!selectedUri || inferenceLoading}
                >
                    {inferenceLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="#FFFFFF" />
                            <Text style={styles.analyzeBtnText}>Analyser</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* Résultats */}
            {analysis && (
                <>
                    {/* Risque global */}
                    <View style={[styles.globalRisk, { backgroundColor: riskColors[analysis.globalRisk] }]}>
                        <MaterialCommunityIcons
                            name={riskIcons[analysis.globalRisk]}
                            size={28}
                            color="#FFFFFF"
                        />
                        <View style={styles.globalRiskContent}>
                            <Text style={styles.globalRiskText}>{analysis.globalRisk.toUpperCase()}</Text>
                            <Text style={styles.globalRiskSubtitle}>
                                {analysis.globalRisk === "critical" ? "Intervention immédiate requise" :
                                    analysis.globalRisk === "danger" ? "Correction nécessaire" :
                                        analysis.globalRisk === "warning" ? "Surveillance accrue" :
                                            "Conditions excellentes"}
                            </Text>
                        </View>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        {["1h", "6h", "24h"].map((h) => (
                            <TouchableOpacity
                                key={h}
                                style={[styles.tab, activeTab === h && styles.tabActive]}
                                onPress={() => setActiveTab(h)}
                            >
                                <Text style={[styles.tabText, activeTab === h && styles.tabTextActive]}>{h}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Variables */}
                    {analysis.horizons[activeTab] && (
                        <View style={styles.varsGrid}>
                            {[
                                {
                                    key: "temperature",
                                    label: "Temp",
                                    unit: "°C",
                                    icon: "thermometer",
                                    optimalRange: analysis.horizons[activeTab].temperature.optimalRange,
                                    acceptableRange: analysis.horizons[activeTab].temperature.acceptableRange
                                },
                                {
                                    key: "humidity",
                                    label: "Hum",
                                    unit: "%",
                                    icon: "water-percent",
                                    optimalRange: analysis.horizons[activeTab].humidity.optimalRange,
                                    acceptableRange: analysis.horizons[activeTab].humidity.acceptableRange
                                },
                                {
                                    key: "nh3",
                                    label: "NH₃",
                                    unit: "ppm",
                                    icon: "molecule",
                                    multiply: 1000,
                                    thresholds: analysis.horizons[activeTab].nh3.thresholds
                                },
                                {
                                    key: "co",
                                    label: "CO",
                                    unit: "ppm",
                                    icon: "smoke",
                                    multiply: 1000,
                                    thresholds: analysis.horizons[activeTab].co.thresholds
                                },
                            ].map((v) => {
                                const data = analysis.horizons[activeTab][v.key]
                                const value = v.multiply ? data.value * v.multiply : data.value
                                const color = riskColors[data.risk.level]
                                const icon = data.risk.icon || v.icon

                                return (
                                    <View key={v.key} style={[styles.varCard, { backgroundColor: color + '15' }]}>
                                        <MaterialCommunityIcons name={icon} size={20} color={color} />
                                        <Text style={styles.varLabel}>{v.label}</Text>
                                        <Text style={[styles.varValue, { color }]}>
                                            {value.toFixed(1)} {v.unit}
                                        </Text>

                                        {/* Plage optimale */}
                                        {v.optimalRange && (
                                            <Text style={styles.varOptimal}>
                                                Optimal: {v.optimalRange[0]}-{v.optimalRange[1]}{v.unit}
                                            </Text>
                                        )}

                                        {/* Plage acceptable */}
                                        {v.acceptableRange && (
                                            <Text style={styles.varAcceptable}>
                                                Acceptable: {v.acceptableRange[0]}-{v.acceptableRange[1]}{v.unit}
                                            </Text>
                                        )}

                                        <Text style={[styles.varStatus, { color }]}>{data.risk.message}</Text>

                                        {/* Indicateur de risque */}
                                        <View style={styles.riskIndicator}>
                                            {["optimal", "warning", "danger", "critical"].map((level) => (
                                                <View
                                                    key={level}
                                                    style={[
                                                        styles.riskDot,
                                                        {
                                                            backgroundColor: data.risk.level === level ?
                                                                riskColors[level] :
                                                                riskColors[level] + '30'
                                                        }
                                                    ]}
                                                />
                                            ))}
                                        </View>
                                    </View>
                                )
                            })}
                        </View>
                    )}

                    {/* Recommandations selon scénarios */}
                    {analysis.globalRisk !== "optimal" && (
                        <View style={styles.recommendationsCard}>
                            <Text style={styles.recommendationsTitle}>Recommandations</Text>
                            {analysis.globalRisk === "critical" && (
                                <>
                                    <Text style={styles.recommendationCritical}>
                                        ⚠️ ALERTE CRITIQUE: Intervention immédiate requise.
                                    </Text>
                                    <Text style={styles.recommendationText}>
                                        • Ventiler immédiatement l'élevage
                                        • Vérifier les systèmes de chauffage/refroidissement
                                        • Contacter un vétérinaire si nécessaire
                                    </Text>
                                </>
                            )}
                            {analysis.globalRisk === "danger" && (
                                <>
                                    <Text style={styles.recommendationDanger}>
                                        🔴 Actions correctives nécessaires
                                    </Text>
                                    <Text style={styles.recommendationText}>
                                        • Ajuster la ventilation
                                        • Corriger la température/humidité
                                        • Surveiller les gaz toxiques
                                    </Text>
                                </>
                            )}
                            {analysis.globalRisk === "warning" && (
                                <>
                                    <Text style={styles.recommendationWarning}>
                                        🟡 Surveillance recommandée
                                    </Text>
                                    <Text style={styles.recommendationText}>
                                        • Conditions sous-optimales
                                        • Surveiller régulièrement
                                        • Préparer des actions correctives
                                    </Text>
                                </>
                            )}
                        </View>
                    )}
                </>
            )}

            <View style={styles.spacer} />
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    statusCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        margin: 16,
        padding: 12,
        borderRadius: 8,
    },
    statusText: {
        marginLeft: 8,
        fontSize: 13,
        color: "#4B5563",
        fontWeight: "500",
    },
    card: {
        backgroundColor: "#FFFFFF",
        marginHorizontal: 16,
        padding: 14,
        borderRadius: 10,
        marginBottom: 12,
    },
    cardLabel: {
        fontSize: 12,
        color: "#6B7280",
        fontWeight: "600",
        marginBottom: 4,
    },
    ageValue: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#2563EB",
        textAlign: "center",
        marginBottom: 12,
    },
    ageGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    ageBtn: {
        width: "48%",
        backgroundColor: "#F3F4F6",
        borderRadius: 8,
        padding: 10,
        alignItems: "center",
        marginBottom: 8,
        borderWidth: 2,
        borderColor: "transparent",
    },
    ageBtnActive: {
        backgroundColor: "#DBEAFE",
        borderColor: "#2563EB",
    },
    ageBtnLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#6B7280",
    },
    ageBtnLabelActive: {
        color: "#2563EB",
    },
    ageBtnRange: {
        fontSize: 10,
        color: "#9CA3AF",
    },
    ageBtnRangeActive: {
        color: "#2563EB",
    },
    thresholdsCard: {
        backgroundColor: "#FFFFFF",
        marginHorizontal: 16,
        padding: 14,
        borderRadius: 10,
        marginBottom: 12,
    },
    thresholdsTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 12,
    },
    thresholdRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 10,
    },
    thresholdLabel: {
        fontSize: 12,
        color: "#6B7280",
        marginLeft: 8,
        marginRight: 12,
        width: 80,
    },
    thresholdRanges: {
        flex: 1,
        flexDirection: "row",
        justifyContent: "space-between",
    },
    gasThresholds: {
        flex: 1,
    },
    gasText: {
        fontSize: 10,
        color: "#6B7280",
        marginBottom: 2,
    },
    rangeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignItems: "center",
        minWidth: 80,
    },
    rangeText: {
        fontSize: 10,
        fontWeight: "600",
    },
    rangeLabel: {
        fontSize: 8,
        color: "#6B7280",
        marginTop: 2,
    },
    actionsCard: {
        marginHorizontal: 16,
        marginBottom: 16,
    },
    importBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#6B7280",
        paddingVertical: 10,
        borderRadius: 8,
    },
    importBtnText: {
        color: "#FFFFFF",
        fontWeight: "600",
        fontSize: 13,
        marginLeft: 6,
    },
    fileSelected: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#D1FAE5",
        padding: 8,
        borderRadius: 6,
        marginTop: 8,
    },
    fileSelectedText: {
        color: "#059669",
        fontWeight: "600",
        fontSize: 12,
        marginLeft: 6,
    },
    analyzeBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#2563EB",
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    analyzeBtnText: {
        color: "#FFFFFF",
        fontWeight: "bold",
        fontSize: 14,
        marginLeft: 6,
    },
    globalRisk: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 16,
        padding: 14,
        borderRadius: 10,
        marginBottom: 12,
    },
    globalRiskContent: {
        marginLeft: 12,
    },
    globalRiskText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "bold",
        marginLeft: 8,
    },
    globalRiskSubtitle: {
        color: "#FFFFFF",
        fontSize: 12,
        opacity: 0.9,
    },
    tabs: {
        flexDirection: "row",
        backgroundColor: "#E5E7EB",
        marginHorizontal: 16,
        borderRadius: 8,
        padding: 3,
        marginBottom: 12,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: "center",
        borderRadius: 6,
    },
    tabActive: {
        backgroundColor: "#FFFFFF",
    },
    tabText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#6B7280",
    },
    tabTextActive: {
        color: "#2563EB",
    },
    varsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: 12,
    },
    varCard: {
        width: "47%",
        margin: 4,
        padding: 12,
        borderRadius: 10,
        alignItems: "center",
    },
    varLabel: {
        fontSize: 11,
        color: "#6B7280",
        marginTop: 4,
        fontWeight: "500",
    },
    varValue: {
        fontSize: 18,
        fontWeight: "bold",
        marginTop: 2,
    },
    varOptimal: {
        fontSize: 8,
        color: "#10B981",
        marginTop: 2,
        textAlign: "center",
    },
    varAcceptable: {
        fontSize: 8,
        color: "#F59E0B",
        marginTop: 1,
        textAlign: "center",
    },
    varStatus: {
        fontSize: 10,
        fontWeight: "600",
        marginTop: 4,
    },
    riskIndicator: {
        flexDirection: "row",
        marginTop: 6,
        justifyContent: "center",
    },
    riskDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginHorizontal: 2,
    },
    recommendationsCard: {
        backgroundColor: "#FFFFFF",
        marginHorizontal: 16,
        padding: 14,
        borderRadius: 10,
        marginTop: 12,
        marginBottom: 12,
    },
    recommendationsTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 8,
    },
    recommendationCritical: {
        fontSize: 12,
        color: "#7C3AED",
        fontWeight: "bold",
        marginBottom: 4,
    },
    recommendationDanger: {
        fontSize: 12,
        color: "#EF4444",
        fontWeight: "bold",
        marginBottom: 4,
    },
    recommendationWarning: {
        fontSize: 12,
        color: "#F59E0B",
        fontWeight: "bold",
        marginBottom: 4,
    },
    recommendationText: {
        fontSize: 11,
        color: "#6B7280",
        lineHeight: 16,
    },
    spacer: {
        height: 24,
    },
})

export default PredictionScreen