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
        this.createDistanceDistributionChart();
        this.createOccasionChart();
        this.createFrequencyChart();
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

    // Get cumulative distance by year
    getCumulativeDistance() {
        const yearStats = this.getStatsByYear();
        const years = Object.keys(yearStats).sort();
        let cumulative = 0;
        const cumulativeData = years.map(year => {
            cumulative += yearStats[year].distance;
            return Math.round(cumulative);
        });
        return { years, cumulativeData };
    }

    // Get statistics by month
    getStatsByMonth() {
        const monthStats = {};
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        
        // Initialize all months
        monthNames.forEach(month => {
            monthStats[month] = { distance: 0, count: 0 };
        });

        this.flights.forEach(flight => {
            const month = flight.month;
            if (month && month !== 'XXX') {
                const origin = this.locationMap[flight.origin];
                const destination = this.locationMap[flight.destination];
                
                if (origin && destination) {
                    const distance = this.calculateDistance(
                        origin.lat, origin.lon,
                        destination.lat, destination.lon
                    );
                    monthStats[month].distance += distance;
                    monthStats[month].count += 1;
                }
            }
        });
        return monthStats;
    }

    // Get top airports over time
    getTopAirportsOverTime() {
        const airportStats = {};
        this.flights.forEach(flight => {
            const year = flight.year;
            const origin = flight.origin;
            const destination = flight.destination;
            
            if (!airportStats[year]) {
                airportStats[year] = {};
            }
            
            airportStats[year][origin] = (airportStats[year][origin] || 0) + 1;
            airportStats[year][destination] = (airportStats[year][destination] || 0) + 1;
        });

        // Get top 10 airports overall
        const allAirports = {};
        Object.values(airportStats).forEach(yearData => {
            Object.entries(yearData).forEach(([airport, count]) => {
                allAirports[airport] = (allAirports[airport] || 0) + count;
            });
        });

        const top10Airports = Object.entries(allAirports)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([airport]) => airport);

        return { airportStats, top10Airports };
    }

    // Get distance distribution
    getDistanceDistribution() {
        const distances = [];
        this.flights.forEach(flight => {
            const origin = this.locationMap[flight.origin];
            const destination = this.locationMap[flight.destination];
            
            if (origin && destination) {
                const distance = this.calculateDistance(
                    origin.lat, origin.lon,
                    destination.lat, destination.lon
                );
                distances.push(Math.round(distance));
            }
        });

        // Create bins for distance ranges
        const bins = [
            { range: '0-500 km', min: 0, max: 500, count: 0 },
            { range: '500-1000 km', min: 500, max: 1000, count: 0 },
            { range: '1000-2000 km', min: 1000, max: 2000, count: 0 },
            { range: '2000-5000 km', min: 2000, max: 5000, count: 0 },
            { range: '5000-10000 km', min: 5000, max: 10000, count: 0 },
            { range: '10000+ km', min: 10000, max: Infinity, count: 0 }
        ];

        distances.forEach(distance => {
            const bin = bins.find(b => distance >= b.min && distance < b.max);
            if (bin) bin.count++;
        });

        return bins;
    }

    // Get statistics by occasion
    getStatsByOccasion() {
        const occasionStats = {};
        this.flights.forEach(flight => {
            const occasion = flight.occasion || 'Unknown';
            if (!occasionStats[occasion]) {
                occasionStats[occasion] = { distance: 0, count: 0 };
            }
            
            const origin = this.locationMap[flight.origin];
            const destination = this.locationMap[flight.destination];
            
            if (origin && destination) {
                const distance = this.calculateDistance(
                    origin.lat, origin.lon,
                    destination.lat, destination.lon
                );
                occasionStats[occasion].distance += distance;
                occasionStats[occasion].count += 1;
            }
        });
        return occasionStats;
    }

    // Create cumulative distance chart
    createCumulativeChart() {
        const { years, cumulativeData } = this.getCumulativeDistance();
        
        const ctx = document.getElementById('cumulative-chart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Cumulative Distance (km)',
                    data: cumulativeData,
                    borderColor: 'rgba(37, 99, 235, 1)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(37, 99, 235, 1)',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
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
                            font: { family: 'Inter' },
                            usePointStyle: true,
                            padding: 20
                        }
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
                            font: { family: 'Inter' },
                            callback: function(value) {
                                return value.toLocaleString() + ' km';
                            }
                        },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // Create monthly distance chart
    createMonthlyChart() {
        const monthStats = this.getStatsByMonth();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const distances = monthNames.map(month => Math.round(monthStats[month].distance));
        const counts = monthNames.map(month => monthStats[month].count);

        const ctx = document.getElementById('monthly-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthNames,
                datasets: [
                    {
                        label: 'Distance (km)',
                        data: distances,
                        backgroundColor: 'rgba(99, 102, 241, 0.8)',
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Number of Flights',
                        data: counts,
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
                            font: { family: 'Inter' },
                            usePointStyle: true,
                            padding: 20
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
                            font: { family: 'Inter' }
                        },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { drawOnChartArea: false }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // Create airports timeline chart
    createAirportsTimelineChart() {
        const { airportStats, top10Airports } = this.getTopAirportsOverTime();
        const years = Object.keys(airportStats).sort();
        
        const datasets = top10Airports.map((airport, index) => {
            const colors = [
                'rgba(37, 99, 235, 0.8)', 'rgba(99, 102, 241, 0.8)', 'rgba(139, 92, 246, 0.8)',
                'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(239, 68, 68, 0.8)',
                'rgba(107, 114, 128, 0.8)', 'rgba(156, 163, 175, 0.8)', 'rgba(34, 197, 94, 0.8)',
                'rgba(168, 85, 247, 0.8)'
            ];
            
            const data = years.map(year => airportStats[year][airport] || 0);
            
            return {
                label: airport,
                data: data,
                borderColor: colors[index],
                backgroundColor: colors[index],
                borderWidth: 2,
                fill: false,
                tension: 0.4
            };
        });

        const ctx = document.getElementById('airports-timeline-chart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: datasets
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
                            font: { family: 'Inter' },
                            usePointStyle: true,
                            padding: 15
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // Create distance distribution chart
    createDistanceDistributionChart() {
        const bins = this.getDistanceDistribution();
        const labels = bins.map(bin => bin.range);
        const counts = bins.map(bin => bin.count);

        const ctx = document.getElementById('distance-distribution-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Number of Flights',
                    data: counts,
                    backgroundColor: [
                        'rgba(37, 99, 235, 0.8)',
                        'rgba(99, 102, 241, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)'
                    ],
                    borderColor: [
                        'rgba(37, 99, 235, 1)',
                        'rgba(99, 102, 241, 1)',
                        'rgba(139, 92, 246, 1)',
                        'rgba(16, 185, 129, 1)',
                        'rgba(245, 158, 11, 1)',
                        'rgba(239, 68, 68, 1)'
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
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // Create occasion chart
    createOccasionChart() {
        const occasionStats = this.getStatsByOccasion();
        const occasions = Object.keys(occasionStats);
        const distances = occasions.map(occasion => Math.round(occasionStats[occasion].distance));
        const counts = occasions.map(occasion => occasionStats[occasion].count);

        const ctx = document.getElementById('occasion-chart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: occasions,
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
                            font: { family: 'Inter' },
                            padding: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const occasion = context.label;
                                const distance = context.parsed;
                                const count = counts[context.dataIndex];
                                return `${occasion}: ${distance.toLocaleString()} km (${count} flights)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    // Create frequency chart
    createFrequencyChart() {
        const yearStats = this.getStatsByYear();
        const years = Object.keys(yearStats).sort();
        const flightCounts = years.map(year => yearStats[year].count);

        const ctx = document.getElementById('frequency-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: years,
                datasets: [{
                    label: 'Flights per Year',
                    data: flightCounts,
                    backgroundColor: 'rgba(139, 92, 246, 0.8)',
                    borderColor: 'rgba(139, 92, 246, 1)',
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
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    },
                    x: {
                        ticks: {
                            color: '#6b7280',
                            font: { family: 'Inter' }
                        },
                        grid: { display: false }
                    }
                }
            }
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