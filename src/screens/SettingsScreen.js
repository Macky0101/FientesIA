"use client"

// SettingsScreen.js - Parametres et informations modeles
import { useState } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch } from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"

const SettingsScreen = () => {
    const [notifications, setNotifications] = useState(true)
    const [darkMode, setDarkMode] = useState(false)
    const [autoAnalysis, setAutoAnalysis] = useState(false)

    const SettingItem = ({ icon, title, subtitle, onPress, rightComponent }) => (
        <TouchableOpacity style={styles.settingItem} onPress={onPress} disabled={!onPress}>
            <View style={styles.settingIcon}>
                <MaterialCommunityIcons name={icon} size={20} color="#2563EB" />
            </View>
            <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>{title}</Text>
                {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
            </View>
            {rightComponent || (onPress && <MaterialCommunityIcons name="chevron-right" size={20} color="#9CA3AF" />)}
        </TouchableOpacity>
    )

    const ModelInfoCard = ({ title, icon, specs }) => (
        <View style={styles.modelCard}>
            <View style={styles.modelHeader}>
                <MaterialCommunityIcons name={icon} size={22} color="#2563EB" />
                <Text style={styles.modelTitle}>{title}</Text>
            </View>
            {specs.map((spec, index) => (
                <View key={index} style={styles.specRow}>
                    <Text style={styles.specLabel}>{spec.label}</Text>
                    <Text style={styles.specValue}>{spec.value}</Text>
                </View>
            ))}
        </View>
    )

    return (
        <ScrollView style={styles.container}>
            {/* Section General */}
            <Text style={styles.sectionHeader}>General</Text>
            <View style={styles.section}>
                <SettingItem
                    icon="bell-outline"
                    title="Notifications"
                    subtitle="Recevoir les alertes push"
                    rightComponent={
                        <Switch
                            value={notifications}
                            onValueChange={setNotifications}
                            trackColor={{ false: "#E5E7EB", true: "#BFDBFE" }}
                            thumbColor={notifications ? "#2563EB" : "#9CA3AF"}
                        />
                    }
                />
                <SettingItem
                    icon="theme-light-dark"
                    title="Mode sombre"
                    subtitle="Apparence de l'application"
                    rightComponent={
                        <Switch
                            value={darkMode}
                            onValueChange={setDarkMode}
                            trackColor={{ false: "#E5E7EB", true: "#BFDBFE" }}
                            thumbColor={darkMode ? "#2563EB" : "#9CA3AF"}
                        />
                    }
                />
                <SettingItem
                    icon="robot-outline"
                    title="Analyse automatique"
                    subtitle="Analyser les images a la capture"
                    rightComponent={
                        <Switch
                            value={autoAnalysis}
                            onValueChange={setAutoAnalysis}
                            trackColor={{ false: "#E5E7EB", true: "#BFDBFE" }}
                            thumbColor={autoAnalysis ? "#2563EB" : "#9CA3AF"}
                        />
                    }
                />
            </View>

            {/* Section Modeles IA */}
            <Text style={styles.sectionHeader}>Modeles IA</Text>

            <ModelInfoCard
                title="MobileNetV2 - Classification"
                icon="camera-iris"
                specs={[
                    { label: "Type", value: "Classification (Edge AI)" },
                    { label: "Taille", value: "4.27 MB (TFLite Float16)" },
                    { label: "Precision", value: "98.7% (Accuracy)" },
                    { label: "Entree", value: "224 x 224 x 3 (RGB)" },
                    { label: "Classes", value: "cocci, healthy, ncd, salmo" },
                    { label: "Execution", value: "Locale (telephone)" },
                ]}
            />

            <ModelInfoCard
                title="CNN-BiLSTM-Attention"
                icon="chart-timeline-variant"
                specs={[
                    { label: "Type", value: "Regression multi-cible" },
                    { label: "Taille", value: "0.27 MB (TFLite)" },
                    { label: "Precision (R2)", value: "0.3271 (global)" },
                    { label: "Entree", value: "168h x 47 features" },
                    { label: "Horizons", value: "1h, 6h, 24h" },
                    { label: "Sorties", value: "Temp, Hum, NH3, CO" },
                ]}
            />

            {/* Section Seuils */}
            <Text style={styles.sectionHeader}>Seuils d'alerte</Text>
            <View style={styles.thresholdsSection}>
                <View style={styles.thresholdCard}>
                    <View style={styles.thresholdHeader}>
                        <MaterialCommunityIcons name="molecule" size={20} color="#F59E0B" />
                        <Text style={styles.thresholdTitle}>NH3 (Ammoniac)</Text>
                    </View>
                    <View style={styles.thresholdLevels}>
                        <View style={[styles.levelPill, { backgroundColor: "#D1FAE5" }]}>
                            <Text style={[styles.levelText, { color: "#059669" }]}>≤5 ppm</Text>
                        </View>
                        <View style={[styles.levelPill, { backgroundColor: "#FEF3C7" }]}>
                            <Text style={[styles.levelText, { color: "#D97706" }]}>5-10</Text>
                        </View>
                        <View style={[styles.levelPill, { backgroundColor: "#FEE2E2" }]}>
                            <Text style={[styles.levelText, { color: "#DC2626" }]}>10-20</Text>
                        </View>
                        <View style={[styles.levelPill, { backgroundColor: "#EDE9FE" }]}>
                            <Text style={[styles.levelText, { color: "#7C3AED" }]}>≥25</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.thresholdCard}>
                    <View style={styles.thresholdHeader}>
                        <MaterialCommunityIcons name="smoke" size={20} color="#6B7280" />
                        <Text style={styles.thresholdTitle}>CO (Monoxyde)</Text>
                    </View>
                    <View style={styles.thresholdLevels}>
                        <View style={[styles.levelPill, { backgroundColor: "#D1FAE5" }]}>
                            <Text style={[styles.levelText, { color: "#059669" }]}>≤10 ppm</Text>
                        </View>
                        <View style={[styles.levelPill, { backgroundColor: "#FEF3C7" }]}>
                            <Text style={[styles.levelText, { color: "#D97706" }]}>10-50</Text>
                        </View>
                        <View style={[styles.levelPill, { backgroundColor: "#FEE2E2" }]}>
                            <Text style={[styles.levelText, { color: "#DC2626" }]}>50-600</Text>
                        </View>
                        <View style={[styles.levelPill, { backgroundColor: "#EDE9FE" }]}>
                            <Text style={[styles.levelText, { color: "#7C3AED" }]}>≥2000</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Section Temperature par age */}
            <Text style={styles.sectionHeader}>Zones optimales</Text>
            <View style={styles.ageZonesCard}>
                <View style={styles.ageZoneHeader}>
                    <Text style={styles.ageZoneHeaderText}>Age</Text>
                    <Text style={styles.ageZoneHeaderText}>Temp</Text>
                    <Text style={styles.ageZoneHeaderText}>Hum</Text>
                </View>
                {[
                    { age: "0-7j", temp: "35-37°C", hum: "60-70%" },
                    { age: "8-14j", temp: "32-34°C", hum: "50-70%" },
                    { age: "15-21j", temp: "29-32°C", hum: "50-70%" },
                    { age: "22-28j", temp: "26-29°C", hum: "40-70%" },
                    { age: "28+j", temp: "20-23°C", hum: "40-70%" },
                ].map((zone, index) => (
                    <View key={index} style={styles.ageZoneRow}>
                        <Text style={styles.ageZoneAge}>{zone.age}</Text>
                        <Text style={styles.ageZoneValue}>{zone.temp}</Text>
                        <Text style={styles.ageZoneValue}>{zone.hum}</Text>
                    </View>
                ))}
            </View>

            {/* Section A propos */}
            <Text style={styles.sectionHeader}>A propos</Text>
            <View style={styles.section}>
                <SettingItem icon="information-outline" title="Version" subtitle="FientesIA v1.0.0" />
                <SettingItem icon="update" title="Mise a jour" subtitle="Modeles: Decembre 2025" />
                <SettingItem icon="help-circle-outline" title="Aide" subtitle="Guide d'utilisation" onPress={() => { }} />
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <MaterialCommunityIcons name="bird" size={28} color="#D1D5DB" />
                <Text style={styles.footerText}>FientesIA</Text>
                <Text style={styles.footerSubtext}>Surveillance avicole intelligente</Text>
            </View>

            <View style={styles.spacer} />
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: "600",
        color: "#6B7280",
        marginHorizontal: 16,
        marginTop: 20,
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    section: {
        backgroundColor: "#FFFFFF",
        marginHorizontal: 16,
        borderRadius: 10,
        overflow: "hidden",
    },
    settingItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    settingIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: "#EFF6FF",
        alignItems: "center",
        justifyContent: "center",
    },
    settingContent: {
        flex: 1,
        marginLeft: 10,
    },
    settingTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#1F2937",
    },
    settingSubtitle: {
        fontSize: 11,
        color: "#6B7280",
        marginTop: 1,
    },
    modelCard: {
        backgroundColor: "#FFFFFF",
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 10,
        padding: 14,
    },
    modelHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#E5E7EB",
    },
    modelTitle: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#1F2937",
        marginLeft: 10,
        flex: 1,
    },
    specRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    specLabel: {
        fontSize: 12,
        color: "#6B7280",
    },
    specValue: {
        fontSize: 12,
        fontWeight: "600",
        color: "#1F2937",
        textAlign: "right",
        flex: 1,
        marginLeft: 12,
    },
    thresholdsSection: {
        paddingHorizontal: 16,
    },
    thresholdCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
    },
    thresholdHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    thresholdTitle: {
        fontSize: 13,
        fontWeight: "600",
        color: "#1F2937",
        marginLeft: 8,
    },
    thresholdLevels: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    levelPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        marginRight: 6,
        marginBottom: 4,
    },
    levelText: {
        fontSize: 11,
        fontWeight: "600",
    },
    ageZonesCard: {
        backgroundColor: "#FFFFFF",
        marginHorizontal: 16,
        borderRadius: 10,
        padding: 12,
    },
    ageZoneHeader: {
        flexDirection: "row",
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#E5E7EB",
        marginBottom: 4,
    },
    ageZoneHeaderText: {
        flex: 1,
        fontSize: 11,
        fontWeight: "600",
        color: "#9CA3AF",
        textAlign: "center",
    },
    ageZoneRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    ageZoneAge: {
        flex: 1,
        fontSize: 12,
        color: "#4B5563",
        textAlign: "center",
        fontWeight: "500",
    },
    ageZoneValue: {
        flex: 1,
        fontSize: 12,
        fontWeight: "600",
        color: "#1F2937",
        textAlign: "center",
    },
    footer: {
        alignItems: "center",
        paddingVertical: 24,
        marginTop: 12,
    },
    footerText: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#9CA3AF",
        marginTop: 6,
    },
    footerSubtext: {
        fontSize: 11,
        color: "#D1D5DB",
        marginTop: 2,
    },
    spacer: {
        height: 24,
    },
})

export default SettingsScreen
