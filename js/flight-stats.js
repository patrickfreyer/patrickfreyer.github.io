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
        return Math.round(totalDistance*1.07);
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

    // Get cumulative distance data over time
    getCumulativeDistanceData() {
        const sortedFlights = this.flights
            .map(flight => {
                const origin = this.locationMap[flight.origin];
                const destination = this.locationMap[flight.destination];
                if (origin && destination) {
                    return {
                        ...flight,
                        distance: this.calculateDistance(
                            origin.lat, origin.lon,
                            destination.lat, destination.lon
                        )
                    };
                }
                return null;
            })
            .filter(flight => flight !== null)
            .sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                if (a.month !== b.month) return a.month - b.month;
                return (a.day || 1) - (b.day || 1);
            });

        let cumulativeDistance = 0;
        const data = [];
        
        sortedFlights.forEach(flight => {
            cumulativeDistance += flight.distance;
            const dateStr = flight.day ? 
                `${flight.year}-${String(flight.month).padStart(2, '0')}-${String(flight.day).padStart(2, '0')}` :
                `${flight.year}-${String(flight.month).padStart(2, '0')}-01`;
            data.push({
                date: dateStr,
                cumulative: Math.round(cumulativeDistance)
            });
        });

        return data;
    }

    // Get statistics by month across all years
    getStatsByMonth() {
        const monthStats = {};
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        this.flights.forEach(flight => {
            const monthIndex = flight.month - 1;
            const monthName = monthNames[monthIndex];
            
            if (!monthStats[monthName]) {
                monthStats[monthName] = { distance: 0, count: 0 };
            }
            
            const origin = this.locationMap[flight.origin];
            const destination = this.locationMap[flight.destination];
            
            if (origin && destination) {
                const distance = this.calculateDistance(
                    origin.lat, origin.lon,
                    destination.lat, destination.lon
                );
                monthStats[monthName].distance += distance;
                monthStats[monthName].count += 1;
            }
        });

        // Ensure all months are present
        monthNames.forEach(month => {
            if (!monthStats[month]) {
                monthStats[month] = { distance: 0, count: 0 };
            }
        });

        return monthStats;
    }

    // Get airport visit counts over time
    getAirportTimelineData() {
        const airportStats = {};
        const sortedFlights = this.flights.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.month - b.month;
        });

        sortedFlights.forEach(flight => {
            // Count both origin and destination
            [flight.origin, flight.destination].forEach(airport => {
                if (!airportStats[airport]) {
                    airportStats[airport] = { count: 0, firstYear: flight.year };
                }
                airportStats[airport].count += 1;
            });
        });

        // Get top 10 airports by visit count
        const topAirports = Object.entries(airportStats)
            .sort(([,a], [,b]) => b.count - a.count)
            .slice(0, 10);

        return topAirports;
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
        this.createCumulativeChart();
        this.createMonthlyChart();
        this.createAirportsTimelineChart();
        this.updateTopDestinations();
        this.updateTopAirlines();
    }

    createYearChart() {
        const yearStats = this.getStatsByYear();
        const years = Object.keys(yearStats).sort();
        const distances = years.map(year => Math.round(yearStats[year].distance));
        const flightCounts = years.map(year => yearStats[year].count);

        const ctx = document.getElementById('year-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'Distance (km)',
                        data: distances,
                        backgroundColor: 'rgba(37, 99, 235, 0.8)',
                        borderColor: 'rgba(37, 99, 235, 1)',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Number of Flights',
                        data: flightCounts,
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            },
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label === 'Distance (km)') {
                                    return `Distance: ${context.parsed.y.toLocaleString()} km`;
                                } else {
                                    return `Flights: ${context.parsed.y}`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        title: {
                            display: true,
                            text: 'Distance (km)',
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        title: {
                            display: true,
                            text: 'Number of Flights',
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        },
                        grid: {
                            display: false
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
                        'rgba(37, 99, 235, 0.8)',
                        'rgba(99, 102, 241, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(107, 114, 128, 0.8)',
                        'rgba(156, 163, 175, 0.8)'
                    ],
                    borderColor: [
                        'rgba(37, 99, 235, 1)',
                        'rgba(99, 102, 241, 1)',
                        'rgba(139, 92, 246, 1)',
                        'rgba(16, 185, 129, 1)',
                        'rgba(245, 158, 11, 1)',
                        'rgba(239, 68, 68, 1)',
                        'rgba(107, 114, 128, 1)',
                        'rgba(156, 163, 175, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            },
                            padding: 20
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    createCumulativeChart() {
        const cumulativeData = this.getCumulativeDistanceData();
        const labels = cumulativeData.map(d => d.date);
        const distances = cumulativeData.map(d => d.cumulative);

        const ctx = document.getElementById('cumulative-chart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cumulative Distance (km)',
                    data: distances,
                    borderColor: 'rgba(37, 99, 235, 1)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(37, 99, 235, 1)',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Total Distance: ${context.parsed.y.toLocaleString()} km`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            },
                            callback: function(value) {
                                return (value/1000).toFixed(0) + 'K';
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            },
                            maxTicksLimit: 10
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    createMonthlyChart() {
        const monthStats = this.getStatsByMonth();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const distances = monthNames.map(month => Math.round(monthStats[month].distance));

        const ctx = document.getElementById('monthly-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthNames,
                datasets: [{
                    label: 'Distance (km)',
                    data: distances,
                    backgroundColor: [
                        'rgba(37, 99, 235, 0.8)', 'rgba(99, 102, 241, 0.8)', 'rgba(139, 92, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)', 'rgba(5, 150, 105, 0.8)', 'rgba(245, 158, 11, 0.8)',
                        'rgba(251, 191, 36, 0.8)', 'rgba(239, 68, 68, 0.8)', 'rgba(220, 38, 127, 0.8)',
                        'rgba(107, 114, 128, 0.8)', 'rgba(75, 85, 99, 0.8)', 'rgba(55, 65, 81, 0.8)'
                    ],
                    borderColor: [
                        'rgba(37, 99, 235, 1)', 'rgba(99, 102, 241, 1)', 'rgba(139, 92, 246, 1)',
                        'rgba(16, 185, 129, 1)', 'rgba(5, 150, 105, 1)', 'rgba(245, 158, 11, 1)',
                        'rgba(251, 191, 36, 1)', 'rgba(239, 68, 68, 1)', 'rgba(220, 38, 127, 1)',
                        'rgba(107, 114, 128, 1)', 'rgba(75, 85, 99, 1)', 'rgba(55, 65, 81, 1)'
                    ],
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Distance: ${context.parsed.y.toLocaleString()} km`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    createAirportsTimelineChart() {
        const airportData = this.getAirportTimelineData();
        const airports = airportData.map(([airport]) => airport);
        const counts = airportData.map(([, data]) => data.count);

        const ctx = document.getElementById('airports-timeline-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: airports,
                datasets: [{
                    label: 'Visits',
                    data: counts,
                    backgroundColor: 'rgba(37, 99, 235, 0.8)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Visits: ${context.parsed.x}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#6b7280',
                            font: {
                                family: 'Inter',
                                size: 11
                            }
                        },
                        grid: {
                            display: false
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
    console.log('DOM loaded, checking for data...');
    
    if (typeof locationsData !== 'undefined' && typeof flightRoutesData !== 'undefined') {
        console.log('Data found, initializing calculator...');
        console.log('Locations:', locationsData.length);
        console.log('Flights:', flightRoutesData.length);
        
        try {
            new FlightStatsCalculator(locationsData, flightRoutesData);
            console.log('FlightStatsCalculator initialized successfully');
        } catch (error) {
            console.error('Error initializing FlightStatsCalculator:', error);
        }
    } else {
        console.error('Required data is missing:', {
            locationsData: typeof locationsData,
            flightRoutesData: typeof flightRoutesData
        });
    }
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded!');
    } else {
        console.log('Chart.js is loaded successfully');
    }
}); 