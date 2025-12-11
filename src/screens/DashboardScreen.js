"use client"

// DashboardScreen.js - Tableau de bord avec historique des activites
import { useState } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { useActivityStore } from "../store/ActivityStore"

const DashboardScreen = ({ navigation }) => {
    const [refreshing, setRefreshing] = useState(false)
    const { history, lastDiagnostic, lastPrediction } = useActivityStore()

    const onRefresh = () => {
        setRefreshing(true)
        setTimeout(() => setRefreshing(false), 1000)
    }

    // Determiner le risque global base sur les dernieres analyses
    const getGlobalStatus = () => {
        if (lastPrediction?.globalRisk === "critical" || lastDiagnostic?.severity === "critical") {
            return { level: "critical", color: "#7C3AED", bg: "#EDE9FE", icon: "alert-octagon", label: "CRITIQUE" }
        }
        if (lastPrediction?.globalRisk === "danger" || lastDiagnostic?.severity === "danger") {
            return { level: "danger", color: "#EF4444", bg: "#FEE2E2", icon: "alert", label: "DANGER" }
        }
        if (lastPrediction?.globalRisk === "warning" || lastDiagnostic?.severity === "warning") {
            return { level: "warning", color: "#F59E0B", bg: "#FEF3C7", icon: "alert-circle", label: "ATTENTION" }
        }
        return { level: "optimal", color: "#10B981", bg: "#D1FAE5", icon: "check-circle", label: "OPTIMAL" }
    }

    const status = getGlobalStatus()

    const formatTime = (isoString) => {
        const date = new Date(isoString)
        const now = new Date()
        const diff = Math.floor((now - date) / 1000 / 60)
        if (diff < 1) return "A l'instant"
        if (diff < 60) return `Il y a ${diff} min`
        if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`
        return date.toLocaleDateString("fr-FR")
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563EB"]} />}
        >
            {/* Status Card */}
            <View style={[styles.statusCard, { backgroundColor: status.bg }]}>
                <MaterialCommunityIcons name={status.icon} size={36} color={status.color} />
                <View style={styles.statusContent}>
                    <Text style={styles.statusLabel}>Etat du lot</Text>
                    <Text style={[styles.statusValue, { color: status.color }]}>{status.label}</Text>
                </View>
            </View>

            {/* Quick Stats Row - Dernieres valeurs */}
            {lastPrediction?.horizons?.["1h"] && (
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="thermometer" size={18} color="#EF4444" />
                        <Text style={styles.statValue}>{lastPrediction.horizons["1h"].temperature.value.toFixed(1)}°</Text>
                    </View>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="water-percent" size={18} color="#3B82F6" />
                        <Text style={styles.statValue}>{lastPrediction.horizons["1h"].humidity.value.toFixed(0)}%</Text>
                    </View>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="molecule" size={18} color="#F59E0B" />
                        <Text style={styles.statValue}>{(lastPrediction.horizons["1h"].nh3.value * 1000).toFixed(1)}</Text>
                    </View>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="smoke" size={18} color="#6B7280" />
                        <Text style={styles.statValue}>{(lastPrediction.horizons["1h"].co.value * 1000).toFixed(0)}</Text>
                    </View>
                </View>
            )}

            {/* Actions - Boutons reduits */}
            <View style={styles.actionsContainer}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("Diagnostic")}>
                    <View style={[styles.actionIcon, { backgroundColor: "#DBEAFE" }]}>
                        <MaterialCommunityIcons name="camera" size={20} color="#2563EB" />
                    </View>
                    <Text style={styles.actionLabel}>Analyser</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("Prevision")}>
                    <View style={[styles.actionIcon, { backgroundColor: "#D1FAE5" }]}>
                        <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="#059669" />
                    </View>
                    <Text style={styles.actionLabel}>Prevoir</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("Parametres")}>
                    <View style={[styles.actionIcon, { backgroundColor: "#F3F4F6" }]}>
                        <MaterialCommunityIcons name="cog-outline" size={20} color="#6B7280" />
                    </View>
                    <Text style={styles.actionLabel}>Reglages</Text>
                </TouchableOpacity>
            </View>

            {/* Dernier Diagnostic */}
            {lastDiagnostic && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Dernier diagnostic</Text>
                    <View style={[styles.resultCard, { borderLeftColor: lastDiagnostic.color }]}>
                        <MaterialCommunityIcons name={lastDiagnostic.icon} size={28} color={lastDiagnostic.color} />
                        <View style={styles.resultContent}>
                            <Text style={styles.resultName}>{lastDiagnostic.name}</Text>
                            <Text style={styles.resultDesc} numberOfLines={1}>
                                {lastDiagnostic.description}
                            </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: lastDiagnostic.color }]}>
                            <Text style={styles.badgeText}>{(lastDiagnostic.confidence * 100).toFixed(0)}%</Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Derniere Prediction */}
            {lastPrediction && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Derniere prevision</Text>
                    <View style={styles.predictionGrid}>
                        {["1h", "6h", "24h"].map((horizon) => {
                            const data = lastPrediction.horizons[horizon]
                            if (!data) return null
                            const riskColors = {
                                optimal: "#10B981",
                                warning: "#F59E0B",
                                danger: "#EF4444",
                                critical: "#7C3AED",
                            }
                            const tempRisk = data.temperature.risk.level
                            return (
                                <View key={horizon} style={styles.predictionItem}>
                                    <Text style={styles.predictionHorizon}>{horizon}</Text>
                                    <Text style={[styles.predictionTemp, { color: riskColors[tempRisk] }]}>
                                        {data.temperature.value.toFixed(1)}°C
                                    </Text>
                                </View>
                            )
                        })}
                    </View>
                </View>
            )}

            {/* Historique des activites */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Activite recente</Text>
                {history.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="history" size={32} color="#D1D5DB" />
                        <Text style={styles.emptyText}>Aucune activite</Text>
                        <Text style={styles.emptySubtext}>Lancez un diagnostic ou une prevision</Text>
                    </View>
                ) : (
                    history.slice(0, 5).map((item) => (
                        <View key={item.id} style={styles.historyItem}>
                            <View
                                style={[styles.historyIcon, { backgroundColor: item.type === "diagnostic" ? "#DBEAFE" : "#D1FAE5" }]}
                            >
                                <MaterialCommunityIcons
                                    name={item.type === "diagnostic" ? "camera" : "chart-line"}
                                    size={16}
                                    color={item.type === "diagnostic" ? "#2563EB" : "#059669"}
                                />
                            </View>
                            <View style={styles.historyContent}>
                                <Text style={styles.historyTitle}>{item.title}</Text>
                                <Text style={styles.historyTime}>{formatTime(item.timestamp)}</Text>
                            </View>
                        </View>
                    ))
                )}
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
    statusCard: {
        flexDirection: "row",
        alignItems: "center",
        margin: 16,
        padding: 16,
        borderRadius: 12,
    },
    statusContent: {
        marginLeft: 12,
    },
    statusLabel: {
        fontSize: 12,
        color: "#6B7280",
        fontWeight: "500",
    },
    statusValue: {
        fontSize: 20,
        fontWeight: "bold",
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        backgroundColor: "#FFFFFF",
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 12,
        borderRadius: 10,
        elevation: 1,
    },
    statItem: {
        flexDirection: "row",
        alignItems: "center",
    },
    statValue: {
        marginLeft: 4,
        fontSize: 14,
        fontWeight: "600",
        color: "#1F2937",
    },
    actionsContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    actionBtn: {
        alignItems: "center",
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 6,
    },
    actionLabel: {
        fontSize: 12,
        color: "#4B5563",
        fontWeight: "500",
    },
    section: {
        marginHorizontal: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#6B7280",
        marginBottom: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    resultCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        padding: 14,
        borderRadius: 10,
        borderLeftWidth: 4,
        elevation: 1,
    },
    resultContent: {
        flex: 1,
        marginLeft: 12,
    },
    resultName: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1F2937",
    },
    resultDesc: {
        fontSize: 12,
        color: "#6B7280",
        marginTop: 2,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "bold",
    },
    predictionGrid: {
        flexDirection: "row",
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        elevation: 1,
        overflow: "hidden",
    },
    predictionItem: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 14,
        borderRightWidth: 1,
        borderRightColor: "#F3F4F6",
    },
    predictionHorizon: {
        fontSize: 11,
        color: "#9CA3AF",
        fontWeight: "600",
        marginBottom: 4,
    },
    predictionTemp: {
        fontSize: 16,
        fontWeight: "bold",
    },
    emptyState: {
        backgroundColor: "#FFFFFF",
        padding: 24,
        borderRadius: 10,
        alignItems: "center",
    },
    emptyText: {
        fontSize: 14,
        color: "#6B7280",
        marginTop: 8,
    },
    emptySubtext: {
        fontSize: 12,
        color: "#9CA3AF",
        marginTop: 2,
    },
    historyItem: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    historyIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    historyContent: {
        flex: 1,
        marginLeft: 10,
    },
    historyTitle: {
        fontSize: 13,
        fontWeight: "500",
        color: "#1F2937",
    },
    historyTime: {
        fontSize: 11,
        color: "#9CA3AF",
        marginTop: 2,
    },
    spacer: {
        height: 20,
    },
})

export default DashboardScreen
