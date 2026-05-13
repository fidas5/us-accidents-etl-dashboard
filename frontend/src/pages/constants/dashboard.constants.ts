/**
 * 📋 DASHBOARD CONSTANTS - Fichier central des constantes partagées
 * 
 * Ce fichier contient toutes les constantes utilisées dans le dashboard
 * pour éviter la duplication et faciliter la maintenance.
 * 
 * 🎯 Avantages :
 * - Changement unique (modifier une constante = mise à jour partout)
 * - Code plus lisible 
 * - Évite les erreurs de frappe
 * - Centralisation des données métier
  */

export const SEV_COLORS: Record<string, string> = { Low: "#34d399", Moderate: "#f59e0b", High: "#fb923c", Critical: "#f43f5e" };
export const SEV_OPTIONS = [{ value: 1, label: "Low", color: "#34d399" }, { value: 2, label: "Moderate", color: "#f59e0b" }, { value: 3, label: "High", color: "#fb923c" }, { value: 4, label: "Critical", color: "#f43f5e" }];
export const MONTHS = [{ value: 1, name: "January" }, { value: 2, name: "February" }, { value: 3, name: "March" }, { value: 4, name: "April" }, { value: 5, name: "May" }, { value: 6, name: "June" }, { value: 7, name: "July" }, { value: 8, name: "August" }, { value: 9, name: "September" }, { value: 10, name: "October" }, { value: 11, name: "November" }, { value: 12, name: "December" }];
export const ALL_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
export const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
export const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const TILE_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>';
export const ROAD_FEATS = ['amenity','bump','crossing','give_way','junction','no_exit','railway','roundabout','station','stop','traffic_calming','traffic_signal','turning_loop'];
export const ROAD_FEAT_SET = new Set(ROAD_FEATS);