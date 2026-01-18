import { Component, OnInit } from '@angular/core';
import { ChartType } from '../../dashboards/default/dashboard.model';
import { ProductService, ExpoEventService, RepairService, InspectionService, MovementService, TransportListService, StorageCaseService, PodiumService } from 'src/app/opmobilitybackend/services';
import { ProductResponse, GetExpoEventResponse, Repair, Inspection, GetMovementResponse, GetTransportListResponse } from 'src/app/opmobilitybackend/models';
import { NotificationService } from 'src/app/core/services/notification.service';
import { forkJoin } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';

interface DashboardStats {
  totalProducts: number;
  totalEvents: number;
  totalRepairs: number;
  totalInspections: number;
  totalMovements: number;
  totalTransportLists: number;
  totalStorageCases: number;
  totalPodiums: number;
  productsByStatus: { [key: string]: number };
  eventsByStatus: { [key: string]: number };
  repairsByStatus: { [key: string]: number };
  inspectionsByResult: { [key: string]: number };
  recentMovements: GetMovementResponse[];
  recentEvents: GetExpoEventResponse[];
}

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss']
})
export class OverviewComponent implements OnInit {
  breadCrumbItems: Array<{}> = [
    { label: 'RMobility' },
    { label: 'Overview', active: true }
  ];

  isLoading = false;
  stats: DashboardStats = {
    totalProducts: 0,
    totalEvents: 0,
    totalRepairs: 0,
    totalInspections: 0,
    totalMovements: 0,
    totalTransportLists: 0,
    totalStorageCases: 0,
    totalPodiums: 0,
    productsByStatus: {},
    eventsByStatus: {},
    repairsByStatus: {},
    inspectionsByResult: {},
    recentMovements: [],
    recentEvents: []
  };

  // Chart configurations
  productsByStatusChart: ChartType;
  movementsTimelineChart: ChartType;
  eventsByStatusChart: ChartType;
  repairsByStatusChart: ChartType;

  // KPI Cards Data
  kpiCards = [
    { title: 'Total Products', value: 0, icon: 'bx bx-package', color: 'primary', id: 'products' },
    { title: 'Active Events', value: 0, icon: 'bx bx-calendar-event', color: 'success', id: 'events' },
    { title: 'Active Repairs', value: 0, icon: 'bx bx-wrench', color: 'warning', id: 'repairs' },
    { title: 'Total Inspections', value: 0, icon: 'bx bx-check-circle', color: 'info', id: 'inspections' },
    { title: 'Total Movements', value: 0, icon: 'bx bx-transfer', color: 'primary', id: 'movements' },
    { title: 'Transport Lists', value: 0, icon: 'bx bx-list-ul', color: 'success', id: 'transportLists' }
  ];

  constructor(
    private productService: ProductService,
    private expoEventService: ExpoEventService,
    private repairService: RepairService,
    private inspectionService: InspectionService,
    private movementService: MovementService,
    private transportListService: TransportListService,
    private storageCaseService: StorageCaseService,
    private podiumService: PodiumService,
    private notificationService: NotificationService
  ) {
    this.initializeCharts();
  }

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private initializeCharts(): void {
    // Products by Status - Donut Chart
    this.productsByStatusChart = {
      chart: {
        height: 350,
        type: 'donut',
        toolbar: {
          show: true
        }
      },
      series: [],
      labels: [],
      colors: ['#556ee6', '#f1b44c', '#34c38f', '#f46a6a', '#50a5f1'],
      legend: {
        position: 'bottom'
      },
      plotOptions: {
        pie: {
          donut: {
            size: '70%',
            labels: {
              show: true,
              name: {
                show: true,
                fontSize: '14px',
                fontWeight: 600
              },
              value: {
                show: true,
                fontSize: '16px',
                fontWeight: 600,
                formatter: (val: string) => val
              },
              total: {
                show: true,
                label: 'Total Products',
                fontSize: '14px',
                fontWeight: 600,
                formatter: () => {
                  return this.stats.totalProducts.toString();
                }
              }
            }
          }
        }
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => {
          return val.toFixed(1) + '%';
        }
      }
    };

    // Movements Timeline Chart
    this.movementsTimelineChart = {
      chart: {
        height: 350,
        type: 'area',
        toolbar: {
          show: true
        },
        zoom: {
          enabled: true
        }
      },
      series: [{
        name: 'Movements',
        data: []
      }],
      xaxis: {
        type: 'datetime',
        categories: []
      },
      colors: ['#556ee6'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.9,
          stops: [0, 90, 100]
        }
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        curve: 'smooth',
        width: 3
      },
      tooltip: {
        x: {
          format: 'dd MMM yyyy'
        }
      }
    };

    // Events by Status - Bar Chart
    this.eventsByStatusChart = {
      chart: {
        height: 350,
        type: 'bar',
        toolbar: {
          show: true
        }
      },
      series: [{
        name: 'Events',
        data: []
      }],
      xaxis: {
        categories: []
      },
      colors: ['#34c38f'],
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%',
          endingShape: 'rounded'
        }
      },
      dataLabels: {
        enabled: true
      },
      fill: {
        opacity: 1
      }
    };

    // Repairs by Status - Pie Chart
    this.repairsByStatusChart = {
      chart: {
        height: 350,
        type: 'pie',
        toolbar: {
          show: true
        }
      },
      series: [],
      labels: [],
      colors: ['#f1b44c', '#34c38f', '#f46a6a'],
      legend: {
        position: 'bottom'
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => {
          return val.toFixed(1) + '%';
        }
      }
    };
  }

  loadDashboardData(): void {
    this.isLoading = true;

    // Fetch all data in parallel
    const requests = {
      products: this.productService.productControllerGetAllProductsV1$Response({ limit: 1000 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading products:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      ),
      events: this.expoEventService.expoEventControllerGetAllExpoEventsV1$Response({ limit: 1000 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading events:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      ),
      repairs: this.repairService.repairControllerFindAllV1$Response({ limit: 1000 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading repairs:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      ),
      inspections: this.inspectionService.inspectionControllerFindAllV1$Response({ limit: 1000 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading inspections:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      ),
      movements: this.movementService.movementControllerGetAllMovementsV1$Response({ limit: 100 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading movements:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      ),
      transportLists: this.transportListService.transportListControllerGetAllTransportListsV1$Response({ limit: 1000 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading transport lists:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      ),
      storageCases: this.storageCaseService.storageCaseControllerGetAllStorageCasesV1$Response({ limit: 1000 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading storage cases:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      ),
      podiums: this.podiumService.podiumControllerGetAllPodiumsV1$Response({ limit: 1000 }).pipe(
        map(response => response.body as any),
        catchError(error => {
          console.error('Error loading podiums:', error);
          return of({ items: [], meta: { totalItems: 0 } });
        })
      )
    };

    forkJoin(requests).subscribe({
      next: (results) => {
        // Process products
        const products = Array.isArray(results.products) ? results.products : (results.products.items || []);
        this.stats.totalProducts = Array.isArray(results.products) ? products.length : (results.products.meta?.totalItems || 0);
        this.stats.productsByStatus = this.groupByStatus(products, 'status');

        // Process events
        const events = Array.isArray(results.events) ? results.events : (results.events.items || []);
        this.stats.totalEvents = Array.isArray(results.events) ? events.length : (results.events.meta?.totalItems || 0);
        this.stats.eventsByStatus = this.groupByStatus(events, 'status');
        this.stats.recentEvents = events.slice(0, 5);

        // Process repairs
        const repairs = Array.isArray(results.repairs) ? results.repairs : (results.repairs.items || []);
        this.stats.totalRepairs = Array.isArray(results.repairs) ? repairs.length : (results.repairs.meta?.totalItems || 0);
        this.stats.repairsByStatus = this.groupByStatus(repairs, 'status');

        // Process inspections
        const inspections = Array.isArray(results.inspections) ? results.inspections : (results.inspections.items || []);
        this.stats.totalInspections = Array.isArray(results.inspections) ? inspections.length : (results.inspections.meta?.totalItems || 0);

        // Process movements
        const movements = Array.isArray(results.movements) ? results.movements : (results.movements.items || []);
        this.stats.totalMovements = Array.isArray(results.movements) ? movements.length : (results.movements.meta?.totalItems || 0);
        this.stats.recentMovements = movements.slice(0, 10);

        // Process transport lists
        const transportLists = Array.isArray(results.transportLists) ? results.transportLists : (results.transportLists.items || []);
        this.stats.totalTransportLists = Array.isArray(results.transportLists) ? transportLists.length : (results.transportLists.meta?.totalItems || 0);

        // Process storage cases
        const storageCases = Array.isArray(results.storageCases) ? results.storageCases : (results.storageCases.items || []);
        this.stats.totalStorageCases = Array.isArray(results.storageCases) ? storageCases.length : (results.storageCases.meta?.totalItems || 0);

        // Process podiums
        const podiums = Array.isArray(results.podiums) ? results.podiums : (results.podiums.items || []);
        this.stats.totalPodiums = Array.isArray(results.podiums) ? podiums.length : (results.podiums.meta?.totalItems || 0);

        // Update KPI cards
        this.updateKPICards();

        // Update charts
        this.updateCharts();

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading dashboard data:', error);
        this.notificationService.error('Failed to load dashboard data. Please try again.');
        this.isLoading = false;
      }
    });
  }

  private groupByStatus(items: any[], statusField: string): { [key: string]: number } {
    const grouped: { [key: string]: number } = {};
    items.forEach(item => {
      const status = item[statusField] || 'Unknown';
      grouped[status] = (grouped[status] || 0) + 1;
    });
    return grouped;
  }

  private updateKPICards(): void {
    this.kpiCards[0].value = this.stats.totalProducts;
    this.kpiCards[1].value = this.stats.eventsByStatus['InProgress'] || 0;
    this.kpiCards[2].value = this.stats.repairsByStatus['IN_PROGRESS'] || 0;
    this.kpiCards[3].value = this.stats.totalInspections;
    this.kpiCards[4].value = this.stats.totalMovements;
    this.kpiCards[5].value = this.stats.totalTransportLists;
  }

  private updateCharts(): void {
    // Update Products by Status Chart
    const productStatuses = Object.keys(this.stats.productsByStatus);
    const productValues = Object.values(this.stats.productsByStatus);
    this.productsByStatusChart = {
      ...this.productsByStatusChart,
      series: productValues,
      labels: productStatuses.map(s => this.formatStatus(s))
    };

    // Update Movements Timeline Chart
    const movementsData = this.stats.recentMovements.map(m => ({
      x: new Date(m.movedAt).getTime(),
      y: 1
    })).sort((a, b) => a.x - b.x);

    // Group by date
    const movementsByDate: { [key: string]: number } = {};
    movementsData.forEach(m => {
      const dateKey = new Date(m.x).toISOString().split('T')[0];
      movementsByDate[dateKey] = (movementsByDate[dateKey] || 0) + 1;
    });

    const dates = Object.keys(movementsByDate).sort();
    const counts = dates.map(d => movementsByDate[d]);

    this.movementsTimelineChart = {
      ...this.movementsTimelineChart,
      series: [{
        name: 'Movements',
        data: dates.map((date, index) => ({
          x: date,
          y: counts[index]
        }))
      }],
      xaxis: {
        ...this.movementsTimelineChart.xaxis,
        categories: dates
      }
    };

    // Update Events by Status Chart
    const eventStatuses = Object.keys(this.stats.eventsByStatus);
    const eventValues = Object.values(this.stats.eventsByStatus);
    this.eventsByStatusChart = {
      ...this.eventsByStatusChart,
      series: [{
        name: 'Events',
        data: eventValues
      }],
      xaxis: {
        ...this.eventsByStatusChart.xaxis,
        categories: eventStatuses.map(s => this.formatStatus(s))
      }
    };

    // Update Repairs by Status Chart
    const repairStatuses = Object.keys(this.stats.repairsByStatus);
    const repairValues = Object.values(this.stats.repairsByStatus);
    this.repairsByStatusChart = {
      ...this.repairsByStatusChart,
      series: repairValues,
      labels: repairStatuses.map(s => this.formatStatus(s))
    };
  }

  private formatStatus(status: string): string {
    return status
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  refreshData(): void {
    this.loadDashboardData();
  }
}
