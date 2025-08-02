// Flight Statistics Calculator
class FlightStatsCalculator {
    constructor(locationsData, flightRoutesData) {
        this.locations = locationsData;
        this.flights = flightRoutesData;
        this.locationMap = this.createLocationMap();
        this.init();
    }

    createLocationMap() {
        const map = {};
        this.locations.forEach(location => {
            map[location.name] = {
                lat: location.lat,
                lon: location.lon
            };
        });
        return map;
    }

    // Calculate distance between two points using Haversine formula
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    // Calculate total distance for all flights
    calculateTotalDistance() {
        let totalDistance = 0;
        this.flights.forEach(flight => {
            const origin = this.locationMap[flight.origin];
            const destination = this.locationMap[flight.destination];
            
            if (origin && destination) {
                const distance = this.calculateDistance(
                    origin.lat, origin.lon,
                    destination.lat, destination.lon
                );
                totalDistance += distance;
            }
        });
        return Math.round(totalDistance);
    }

    // Get statistics by year
    getStatsByYear() {
        const yearStats = {};
        this.flights.forEach(flight => {
            const year = flight.year;
            if (!yearStats[year]) {
                yearStats[year] = { distance: 0, count: 0 };
            }
            
            const origin = this.locationMap[flight.origin];
            const destination = this.locationMap[flight.destination];
            
            if (origin && destination) {
                const distance = this.calculateDistance(
                    origin.lat, origin.lon,
                    destination.lat, destination.lon
                );
                yearStats[year].distance += distance;
                yearStats[year].count += 1;
            }
        });
        return yearStats;
    }

    // Get statistics by companion
    getStatsByCompanion() {
        const companionStats = {};
        this.flights.forEach(flight => {
            if (flight.travelers) {
                flight.travelers.forEach(traveler => {
                    if (traveler !== "Patrick") { // Exclude self
                        if (!companionStats[traveler]) {
                            companionStats[traveler] = { distance: 0, count: 0 };
                        }
                        
                        const origin = this.locationMap[flight.origin];
                        const destination = this.locationMap[flight.destination];
                        
                        if (origin && destination) {
                            const distance = this.calculateDistance(
                                origin.lat, origin.lon,
                                destination.lat, destination.lon
                            );
                            companionStats[traveler].distance += distance;
                            companionStats[traveler].count += 1;
                        }
                    }
                });
            }
        });
        return companionStats;
    }

    // Get unique countries visited
    getUniqueCountries() {
        const countries = new Set();
        this.flights.forEach(flight => {
            countries.add(flight.origin);
            countries.add(flight.destination);
        });
        return countries.size;
    }

    // Get top destinations
    getTopDestinations() {
        const destinations = {};
        this.flights.forEach(flight => {
            const dest = flight.destination;
            destinations[dest] = (destinations[dest] || 0) + 1;
        });
        
        return Object.entries(destinations)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
    }

    // Get top airlines
    getTopAirlines() {
        const airlines = {};
        this.flights.forEach(flight => {
            const airline = flight.airline;
            airlines[airline] = (airlines[airline] || 0) + 1;
        });
        
        return Object.entries(airlines)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
    }

    // Update the UI with calculated statistics
    updateUI() {
        const totalDistance = this.calculateTotalDistance();
        const totalFlights = this.flights.length;
        const countriesVisited = this.getUniqueCountries();
        const years = new Set(this.flights.map(f => f.year)).size;

        document.getElementById('total-distance').textContent = totalDistance.toLocaleString();
        document.getElementById('total-flights').textContent = totalFlights;
        document.getElementById('countries-visited').textContent = countriesVisited;
        document.getElementById('years-traveled').textContent = years;

        this.createYearChart();
        this.createCompanionChart();
        this.updateTopDestinations();
        this.updateTopAirlines();
    }

    createYearChart() {
        const yearStats = this.getStatsByYear();
        const years = Object.keys(yearStats).sort();
        const distances = years.map(year => Math.round(yearStats[year].distance));

        const ctx = document.getElementById('year-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: years,
                datasets: [{
                    label: 'Distance (km)',
                    data: distances,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: 'white'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: 'white'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'white'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    createCompanionChart() {
        const companionStats = this.getStatsByCompanion();
        const companions = Object.keys(companionStats);
        const distances = companions.map(companion => Math.round(companionStats[companion].distance));

        const ctx = document.getElementById('companion-chart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: companions,
                datasets: [{
                    data: distances,
                    backgroundColor: [
                        '#FF6384',
                        '#36A2EB',
                        '#FFCE56',
                        '#4BC0C0',
                        '#9966FF',
                        '#FF9F40',
                        '#FF6384',
                        '#C9CBCF'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'white'
                        }
                    }
                }
            }
        });
    }

    updateTopDestinations() {
        const topDestinations = this.getTopDestinations();
        const container = document.getElementById('top-destinations');
        container.innerHTML = '';

        topDestinations.forEach(([destination, count]) => {
            const item = document.createElement('div');
            item.className = 'destination-item';
            item.innerHTML = `
                <span class="destination-name">${destination}</span>
                <span class="destination-count">${count}</span>
            `;
            container.appendChild(item);
        });
    }

    updateTopAirlines() {
        const topAirlines = this.getTopAirlines();
        const container = document.getElementById('top-airlines');
        container.innerHTML = '';

        topAirlines.forEach(([airline, count]) => {
            const item = document.createElement('div');
            item.className = 'airline-item';
            item.innerHTML = `
                <span class="airline-name">${airline}</span>
                <span class="airline-count">${count}</span>
            `;
            container.appendChild(item);
        });
    }

    init() {
        this.updateUI();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (typeof locationsData !== 'undefined' && typeof flightRoutesData !== 'undefined') {
        new FlightStatsCalculator(locationsData, flightRoutesData);
    }
}); 