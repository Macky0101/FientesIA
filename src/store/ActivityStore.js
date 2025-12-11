"use client"

// ActivityStore.js - Store global pour l'historique des activites
import { useState, useEffect } from "react"

// Store simple avec listeners
let activityHistory = []
let lastDiagnostic = null
let lastPrediction = null
let listeners = []

const notify = () => {
    listeners.forEach((listener) => listener())
}

export const ActivityStore = {
    // Ajouter une activite
    addActivity: (activity) => {
        activityHistory = [
            {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                ...activity,
            },
            ...activityHistory,
        ].slice(0, 10) // Garder les 10 dernieres
        notify()
    },

    // Sauvegarder le dernier diagnostic
    setLastDiagnostic: (diagnostic) => {
        lastDiagnostic = diagnostic
        ActivityStore.addActivity({
            type: "diagnostic",
            title: `Diagnostic: ${diagnostic.name}`,
            result: diagnostic,
        })
        notify()
    },

    // Sauvegarder la derniere prediction
    setLastPrediction: (prediction) => {
        lastPrediction = prediction
        ActivityStore.addActivity({
            type: "prediction",
            title: `Prevision: ${prediction.globalRisk.toUpperCase()}`,
            result: prediction,
        })
        notify()
    },

    // Getters
    getHistory: () => activityHistory,
    getLastDiagnostic: () => lastDiagnostic,
    getLastPrediction: () => lastPrediction,

    // Subscribe pour les composants React
    subscribe: (listener) => {
        listeners.push(listener)
        return () => {
            listeners = listeners.filter((l) => l !== listener)
        }
    },
}

// Hook pour utiliser le store
export const useActivityStore = () => {
    const [, forceUpdate] = useState(0)

    useEffect(() => {
        return ActivityStore.subscribe(() => forceUpdate((n) => n + 1))
    }, [])

    return {
        history: ActivityStore.getHistory(),
        lastDiagnostic: ActivityStore.getLastDiagnostic(),
        lastPrediction: ActivityStore.getLastPrediction(),
    }
}
