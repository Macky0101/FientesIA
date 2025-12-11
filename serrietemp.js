// App.js - Version corrigée sans Slider
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
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import RNFS from 'react-native-fs';
import { NativeModules } from 'react-native';
// REMOVED: import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { HybridModule } = NativeModules;

export default function App() {
    const [modelLoaded, setModelLoaded] = useState(false);
    const [loadingModel, setLoadingModel] = useState(false);
    const [selectedUri, setSelectedUri] = useState(null);
    const [inferenceLoading, setInferenceLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [age, setAge] = useState(21);
    const [analysis, setAnalysis] = useState(null);
    const [activeTab, setActiveTab] = useState('1h');

    // Fichiers modèle
    const MODEL_FILE = "poultry_monitor_model.tflite";
    const SCALER_FILE = "scaler_params.json";
    const CONFIG_FILE = "app_config.json";

    // Seuils par âge
    const getThresholds = (age) => {
        if (age < 7) return { temp: [35, 37], humidity: [60, 70] };
        if (age < 14) return { temp: [32, 34], humidity: [50, 70] };
        if (age < 21) return { temp: [29, 32], humidity: [50, 70] };
        if (age < 28) return { temp: [26, 29], humidity: [40, 70] };
        return { temp: [20, 23], humidity: [40, 70] };
    };

    // Options d'âge prédéfinies
    const ageOptions = [
        { label: 'Poussins (0-7 jours)', value: 3, icon: '🐣' },
        { label: 'Croissance (8-21 jours)', value: 14, icon: '🐥' },
        { label: 'Finition (22-35 jours)', value: 28, icon: '🐔' },
        { label: 'Adultes (35+ jours)', value: 42, icon: '🏭' },
    ];

    // Charger modèle
    useEffect(() => {
        loadModel();
    }, []);

    async function loadModel() {
        try {
            setLoadingModel(true);
            const res = await HybridModule.loadModel(MODEL_FILE, SCALER_FILE, CONFIG_FILE);
            setModelLoaded(true);
        } catch (err) {
            Alert.alert("Erreur", "Impossible de charger le modèle.");
        } finally {
            setLoadingModel(false);
        }
    }

    // Sélection fichier
    async function pickJsonFile() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: "application/json",
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const asset = result.assets?.[0];
            if (!asset || !asset.uri) {
                Alert.alert("Erreur", "Impossible de récupérer le fichier.");
                return;
            }

            setSelectedUri(asset.uri);
            setResults(null);
            setAnalysis(null);
        } catch (err) {
            Alert.alert("Erreur", "Impossible de lire le fichier.");
        }
    }

    // Analyse des données
    async function handleClassify() {
        if (!modelLoaded || !selectedUri) {
            Alert.alert("Erreur", "Modèle non chargé ou fichier manquant.");
            return;
        }

        try {
            setInferenceLoading(true);
            const res = await HybridModule.classifySequenceFromUri(selectedUri);
            setResults(res);
            analyzeResults(res);
        } catch (err) {
            Alert.alert("Erreur", "Analyse échouée.");
        } finally {
            setInferenceLoading(false);
        }
    }

    // Analyse avec seuils
    function analyzeResults(resultsArray) {
        const thresholds = getThresholds(age);
        const groups = {
            '1h': resultsArray.slice(0, 4),
            '6h': resultsArray.slice(4, 8),
            '24h': resultsArray.slice(8, 12)
        };

        const analysisResult = {};
        let globalRisk = 'optimal';

        Object.entries(groups).forEach(([horizon, values]) => {
            const [temp, humidity, nh3, co] = values.map(v => v.value);

            // Évaluer les risques
            const tempRisk = evaluateRisk(temp, thresholds.temp[0], thresholds.temp[1], 'temp');
            const humRisk = evaluateRisk(humidity, thresholds.humidity[0], thresholds.humidity[1], 'humidity');
            const nh3Risk = evaluateGasRisk(nh3 * 1000, 5, 10, 20, 25); // Convertir en ppm
            const coRisk = evaluateGasRisk(co * 1000, 10, 50, 600, 2000);

            analysisResult[horizon] = {
                temperature: { value: temp, risk: tempRisk },
                humidity: { value: humidity, risk: humRisk },
                nh3: { value: nh3, risk: nh3Risk },
                co: { value: co, risk: coRisk }
            };

            // Mettre à jour le risque global
            const risks = [tempRisk.level, humRisk.level, nh3Risk.level, coRisk.level];
            if (risks.includes('critical') && globalRisk !== 'critical') globalRisk = 'critical';
            else if (risks.includes('danger') && globalRisk !== 'critical') globalRisk = 'danger';
            else if (risks.includes('warning') && !['critical', 'danger'].includes(globalRisk)) globalRisk = 'warning';
        });

        setAnalysis({ horizons: analysisResult, globalRisk });
    }

    // Évaluer risque température/humidité
    function evaluateRisk(value, min, max, type) {
        const optimalRange = type === 'temp' ? [min + (max - min) * 0.4, min + (max - min) * 0.6] : [min + 5, max - 5];

        if (value < min) return { level: 'danger', message: 'Trop bas' };
        if (value > max) return { level: 'critical', message: 'Trop élevé' };
        if (value < optimalRange[0] || value > optimalRange[1]) return { level: 'warning', message: 'Sous-optimal' };
        return { level: 'optimal', message: 'Optimal' };
    }

    // Évaluer risque gaz
    function evaluateGasRisk(value, optimal, warning, danger, critical) {
        if (value <= optimal) return { level: 'optimal', message: 'Sécuritaire' };
        if (value <= warning) return { level: 'warning', message: 'Acceptable' };
        if (value <= danger) return { level: 'danger', message: 'Dangereux' };
        return { level: 'critical', message: 'Critique' };
    }

    // Composant Carte de variable
    const VariableCard = ({ title, value, unit, risk, icon }) => {
        const riskConfig = {
            optimal: { color: '#10B981', bg: '#D1FAE5', iconColor: '#059669' },
            warning: { color: '#F59E0B', bg: '#FEF3C7', iconColor: '#D97706' },
            danger: { color: '#EF4444', bg: '#FEE2E2', iconColor: '#DC2626' },
            critical: { color: '#7C3AED', bg: '#EDE9FE', iconColor: '#6D28D9' }
        };

        const config = riskConfig[risk?.level] || riskConfig.optimal;

        return (
            <View style={[styles.variableCard, { backgroundColor: config.bg }]}>
                <View style={styles.variableHeader}>
                    <Icon name={icon} size={24} color={config.iconColor} />
                    <Text style={styles.variableTitle}>{title}</Text>
                </View>

                <Text style={[styles.variableValue, { color: config.color }]}>
                    {value.toFixed(2)} {unit}
                </Text>

                <View style={styles.riskIndicator}>
                    <View style={[styles.riskDot, { backgroundColor: config.color }]} />
                    <Text style={[styles.riskText, { color: config.color }]}>
                        {risk?.message || 'Optimal'}
                    </Text>
                </View>
            </View>
        );
    };

    // Composant Horizon Tab
    const HorizonTab = ({ horizon, isActive, onPress }) => (
        <TouchableOpacity
            style={[styles.tab, isActive && styles.activeTab]}
            onPress={() => setActiveTab(horizon)}
        >
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                {horizon}
            </Text>
        </TouchableOpacity>
    );

    // Composant Bouton d'âge
    const AgeButton = ({ label, value, icon, isSelected }) => (
        <TouchableOpacity
            style={[styles.ageButton, isSelected && styles.ageButtonSelected]}
            onPress={() => setAge(value)}
        >
            <Text style={styles.ageButtonIcon}>{icon}</Text>
            <Text style={[styles.ageButtonLabel, isSelected && styles.ageButtonLabelSelected]}>
                {label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* En-tête */}
            <View style={styles.header}>
                <Icon name="weather-windy" size={32} color="#3B82F6" />
                <Text style={styles.title}>Poultry Monitor</Text>
                <Text style={styles.subtitle}>Surveillance avicole intelligente</Text>
            </View>

            <ScrollView style={styles.scrollView}>
                {/* Carte État système */}
                <View style={styles.statusCard}>
                    <View style={styles.statusHeader}>
                        <Text style={styles.statusTitle}>État du système</Text>
                        {modelLoaded ? (
                            <View style={styles.statusGood}>
                                <Icon name="check-circle" size={20} color="#10B981" />
                                <Text style={styles.statusTextGood}>Prêt</Text>
                            </View>
                        ) : (
                            <View style={styles.statusBad}>
                                <ActivityIndicator size="small" color="#EF4444" />
                                <Text style={styles.statusTextBad}>Chargement...</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Contrôle âge - NOUVEAU avec boutons */}
                <View style={styles.controlCard}>
                    <Text style={styles.controlTitle}>Âge des volailles</Text>
                    <Text style={styles.ageValue}>{age} jours</Text>

                    <View style={styles.ageButtonsContainer}>
                        {ageOptions.map((option) => (
                            <AgeButton
                                key={option.value}
                                label={option.label}
                                value={option.value}
                                icon={option.icon}
                                isSelected={age === option.value}
                            />
                        ))}
                    </View>
                </View>

                {/* Boutons actions */}
                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={[styles.actionBtn, !selectedUri && styles.actionBtnDisabled]}
                        onPress={pickJsonFile}
                    >
                        <Icon name="file-upload" size={24} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Importer</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.analyzeBtn, (!selectedUri || !modelLoaded) && styles.actionBtnDisabled]}
                        onPress={handleClassify}
                        disabled={!selectedUri || !modelLoaded || inferenceLoading}
                    >
                        {inferenceLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <>
                                <Icon name="chart-bar" size={24} color="#FFFFFF" />
                                <Text style={styles.actionBtnText}>Analyser</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Fichier sélectionné */}
                {selectedUri && (
                    <View style={styles.fileCard}>
                        <Icon name="file-check" size={20} color="#10B981" />
                        <Text style={styles.fileText}>Fichier JSON sélectionné</Text>
                    </View>
                )}

                {/* Résultats */}
                {analysis && (
                    <>
                        {/* Risque global */}
                        <View style={[
                            styles.globalRiskCard,
                            analysis.globalRisk === 'critical' && styles.globalRiskCritical,
                            analysis.globalRisk === 'danger' && styles.globalRiskDanger,
                            analysis.globalRisk === 'warning' && styles.globalRiskWarning,
                            analysis.globalRisk === 'optimal' && styles.globalRiskOptimal,
                        ]}>
                            <View style={styles.globalRiskHeader}>
                                <Icon
                                    name={
                                        analysis.globalRisk === 'critical' ? 'alert-octagon' :
                                            analysis.globalRisk === 'danger' ? 'alert' :
                                                analysis.globalRisk === 'warning' ? 'alert-circle' :
                                                    'check-circle'
                                    }
                                    size={28}
                                    color="#FFFFFF"
                                />
                                <Text style={styles.globalRiskTitle}>
                                    {analysis.globalRisk === 'critical' ? 'CRITIQUE' :
                                        analysis.globalRisk === 'danger' ? 'DANGER' :
                                            analysis.globalRisk === 'warning' ? 'ATTENTION' :
                                                'OPTIMAL'}
                                </Text>
                            </View>
                            <Text style={styles.globalRiskText}>
                                {analysis.globalRisk === 'optimal'
                                    ? 'Conditions optimales pour la croissance'
                                    : 'Intervention recommandée'}
                            </Text>
                        </View>

                        {/* Tabs horizons */}
                        <View style={styles.tabsContainer}>
                            {['1h', '6h', '24h'].map(horizon => (
                                <HorizonTab
                                    key={horizon}
                                    horizon={horizon}
                                    isActive={activeTab === horizon}
                                    onPress={() => setActiveTab(horizon)}
                                />
                            ))}
                        </View>

                        {/* Cartes variables pour l'horizon actif */}
                        {analysis.horizons[activeTab] && (
                            <View style={styles.variablesGrid}>
                                <VariableCard
                                    title="Température"
                                    value={analysis.horizons[activeTab].temperature.value}
                                    unit="°C"
                                    risk={analysis.horizons[activeTab].temperature.risk}
                                    icon="thermometer"
                                />
                                <VariableCard
                                    title="Humidité"
                                    value={analysis.horizons[activeTab].humidity.value}
                                    unit="%"
                                    risk={analysis.horizons[activeTab].humidity.risk}
                                    icon="water-percent"
                                />
                                <VariableCard
                                    title="NH3"
                                    value={analysis.horizons[activeTab].nh3.value}
                                    unit="ppm"
                                    risk={analysis.horizons[activeTab].nh3.risk}
                                    icon="chemical-weapon"
                                />
                                <VariableCard
                                    title="CO"
                                    value={analysis.horizons[activeTab].co.value}
                                    unit="ppm"
                                    risk={analysis.horizons[activeTab].co.risk}
                                    icon="smoke"
                                />
                            </View>
                        )}

                        {/* Recommandations */}
                        <View style={styles.recommendationsCard}>
                            <Text style={styles.recommendationsTitle}>Recommandations</Text>
                            <View style={styles.recommendationItem}>
                                <Icon name="lightbulb-on" size={20} color="#F59E0B" />
                                <Text style={styles.recommendationText}>
                                    {analysis.globalRisk === 'optimal'
                                        ? 'Maintenez les conditions actuelles'
                                        : analysis.globalRisk === 'warning'
                                            ? 'Surveillez les paramètres environnementaux'
                                            : 'Ajustez la ventilation et/ou le chauffage'}
                                </Text>
                            </View>
                            <View style={styles.recommendationItem}>
                                <Icon name="calendar-clock" size={20} color="#3B82F6" />
                                <Text style={styles.recommendationText}>
                                    Prochaine vérification recommandée dans 2 heures
                                </Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Informations seuils */}
                {analysis && (
                    <View style={styles.thresholdsCard}>
                        <Text style={styles.thresholdsTitle}>Seuils actuels</Text>
                        <View style={styles.thresholdRow}>
                            <Text style={styles.thresholdLabel}>Température:</Text>
                            <Text style={styles.thresholdValue}>
                                {getThresholds(age).temp[0]}°C - {getThresholds(age).temp[1]}°C
                            </Text>
                        </View>
                        <View style={styles.thresholdRow}>
                            <Text style={styles.thresholdLabel}>Humidité:</Text>
                            <Text style={styles.thresholdValue}>
                                {getThresholds(age).humidity[0]}% - {getThresholds(age).humidity[1]}%
                            </Text>
                        </View>
                    </View>
                )}

                {/* Espace en bas */}
                <View style={styles.spacer} />
            </ScrollView>
        </SafeAreaView>
    );
}

// Styles
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        alignItems: 'center',
        paddingVertical: 20,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1F2937',
        marginTop: 10,
    },
    subtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 4,
    },
    scrollView: {
        flex: 1,
        padding: 16,
    },
    statusCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    statusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937',
    },
    statusGood: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#D1FAE5',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusBad: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusTextGood: {
        color: '#059669',
        fontWeight: '600',
        marginLeft: 6,
    },
    statusTextBad: {
        color: '#DC2626',
        fontWeight: '600',
        marginLeft: 6,
    },
    controlCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    controlTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 8,
    },
    ageValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#3B82F6',
        textAlign: 'center',
        marginVertical: 8,
    },
    ageButtonsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    ageButton: {
        width: '48%',
        alignItems: 'center',
        paddingVertical: 12,
        marginBottom: 10,
        backgroundColor: '#E5E7EB',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#D1D5DB',
    },
    ageButtonSelected: {
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
    },
    ageButtonIcon: {
        fontSize: 24,
        marginBottom: 5,
    },
    ageButtonLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6B7280',
        textAlign: 'center',
    },
    ageButtonLabelSelected: {
        color: '#FFFFFF',
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6B7280',
        borderRadius: 12,
        paddingVertical: 14,
        marginHorizontal: 4,
    },
    analyzeBtn: {
        backgroundColor: '#3B82F6',
    },
    actionBtnDisabled: {
        opacity: 0.5,
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontWeight: '600',
        marginLeft: 8,
        fontSize: 16,
    },
    fileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#D1FAE5',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    fileText: {
        color: '#059669',
        fontWeight: '600',
        marginLeft: 8,
    },
    globalRiskCard: {
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
    },
    globalRiskCritical: {
        backgroundColor: '#7C3AED',
    },
    globalRiskDanger: {
        backgroundColor: '#EF4444',
    },
    globalRiskWarning: {
        backgroundColor: '#F59E0B',
    },
    globalRiskOptimal: {
        backgroundColor: '#10B981',
    },
    globalRiskHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    globalRiskTitle: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold',
        marginLeft: 12,
    },
    globalRiskText: {
        color: '#FFFFFF',
        fontSize: 16,
        opacity: 0.9,
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: '#E5E7EB',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    tabText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
    },
    activeTabText: {
        color: '#3B82F6',
    },
    variablesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    variableCard: {
        width: '48%',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    variableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    variableTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
        marginLeft: 8,
    },
    variableValue: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    riskIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    riskDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    riskText: {
        fontSize: 12,
        fontWeight: '500',
    },
    recommendationsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    recommendationsTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 12,
    },
    recommendationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    recommendationText: {
        fontSize: 14,
        color: '#4B5563',
        marginLeft: 12,
        flex: 1,
    },
    thresholdsCard: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    thresholdsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 12,
    },
    thresholdRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    thresholdLabel: {
        fontSize: 14,
        color: '#6B7280',
    },
    thresholdValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1F2937',
    },
    spacer: {
        height: 30,
    },
});