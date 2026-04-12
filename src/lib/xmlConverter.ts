import { DatabaseExport } from './indexedDB';

export const exportToXML = (data: DatabaseExport): string => {
  const escapeXML = (str: any): string => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const formatDate = (date: any): string => {
    if (!date) return '';
    if (date instanceof Date) return date.toISOString();
    return String(date);
  };

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<AutoTimeData version="${data.version}" exportDate="${data.exportDate}">\n`;

  // Clients
  xml += '  <Clients>\n';
  data.clients.forEach(client => {
    xml += `    <Client `;
    xml += `id="${escapeXML(client.id)}" `;
    xml += `name="${escapeXML(client.name)}" `;
    if (client.email) xml += `email="${escapeXML(client.email)}" `;
    if (client.phone) xml += `phone="${escapeXML(client.phone)}" `;
    if (client.address) xml += `address="${escapeXML(client.address)}" `;
    if (client.city) xml += `city="${escapeXML(client.city)}" `;
    if (client.state) xml += `state="${escapeXML(client.state)}" `;
    if (client.zip) xml += `zip="${escapeXML(client.zip)}" `;
    if (client.companyName) xml += `companyName="${escapeXML(client.companyName)}" `;
    if (client.itin) xml += `itin="${escapeXML(client.itin)}" `;
    if (client.notes) xml += `notes="${escapeXML(client.notes)}" `;
    if (client.hourlyRate) xml += `hourlyRate="${escapeXML(client.hourlyRate)}" `;
    if (client.cloningRate) xml += `cloningRate="${escapeXML(client.cloningRate)}" `;
    if (client.programmingRate) xml += `programmingRate="${escapeXML(client.programmingRate)}" `;
    if (client.addKeyRate) xml += `addKeyRate="${escapeXML(client.addKeyRate)}" `;
    if (client.allKeysLostRate) xml += `allKeysLostRate="${escapeXML(client.allKeysLostRate)}" `;
    if (client.accessCode) xml += `accessCode="${escapeXML(client.accessCode)}" `;
    if (client.portalId) xml += `portalId="${escapeXML(client.portalId)}" `;
    if (client.prepaidAmount) xml += `prepaidAmount="${escapeXML(client.prepaidAmount)}" `;
    xml += `createdAt="${formatDate(client.createdAt)}" `;
    xml += `/>\n`;
  });
  xml += '  </Clients>\n';

  // Vehicles
  xml += '  <Vehicles>\n';
  data.vehicles.forEach(vehicle => {
    xml += `    <Vehicle `;
    xml += `id="${escapeXML(vehicle.id)}" `;
    xml += `clientId="${escapeXML(vehicle.clientId)}" `;
    xml += `vin="${escapeXML(vehicle.vin)}" `;
    if (vehicle.make) xml += `make="${escapeXML(vehicle.make)}" `;
    if (vehicle.model) xml += `model="${escapeXML(vehicle.model)}" `;
    if (vehicle.year) xml += `year="${escapeXML(vehicle.year)}" `;
    if (vehicle.color) xml += `color="${escapeXML(vehicle.color)}" `;
    if (vehicle.prepaidAmount) xml += `prepaidAmount="${escapeXML(vehicle.prepaidAmount)}" `;
    if (vehicle.diagnosticPdfUrl) xml += `diagnosticPdfUrl="${escapeXML(vehicle.diagnosticPdfUrl)}" `;
    xml += `/>\n`;
  });
  xml += '  </Vehicles>\n';

  // Tasks
  xml += '  <Tasks>\n';
  data.tasks.forEach(task => {
    xml += `    <Task `;
    xml += `id="${escapeXML(task.id)}" `;
    xml += `clientId="${escapeXML(task.clientId)}" `;
    xml += `vehicleId="${escapeXML(task.vehicleId)}" `;
    xml += `customerName="${escapeXML(task.customerName)}" `;
    xml += `carVin="${escapeXML(task.carVin)}" `;
    xml += `status="${escapeXML(task.status)}" `;
    xml += `totalTime="${escapeXML(task.totalTime)}" `;
    xml += `needsFollowUp="${escapeXML(task.needsFollowUp)}" `;
    xml += `createdAt="${formatDate(task.createdAt)}" `;
    if (task.startTime) xml += `startTime="${formatDate(task.startTime)}" `;
    if (task.activeSessionId) xml += `activeSessionId="${escapeXML(task.activeSessionId)}" `;
    xml += `>\n`;

    // Sessions
    if (task.sessions && task.sessions.length > 0) {
      xml += '      <Sessions>\n';
      task.sessions.forEach(session => {
        xml += `        <Session `;
        xml += `id="${escapeXML(session.id)}" `;
        xml += `createdAt="${formatDate(session.createdAt)}" `;
        if (session.completedAt) xml += `completedAt="${formatDate(session.completedAt)}" `;
        if (session.description) xml += `description="${escapeXML(session.description)}" `;
        if (session.chargeMinimumHour) xml += `chargeMinimumHour="true" `;
        if (session.isCloning) xml += `isCloning="true" `;
        if (session.isProgramming) xml += `isProgramming="true" `;
        if (session.isAddKey) xml += `isAddKey="true" `;
        if (session.isAllKeysLost) xml += `isAllKeysLost="true" `;
        xml += `>\n`;

        // Periods
        if (session.periods && session.periods.length > 0) {
          xml += '          <Periods>\n';
          session.periods.forEach(period => {
            xml += `            <Period `;
            xml += `id="${escapeXML(period.id)}" `;
            xml += `startTime="${formatDate(period.startTime)}" `;
            xml += `endTime="${formatDate(period.endTime)}" `;
            xml += `duration="${escapeXML(period.duration)}" `;
            if (period.chargeMinimumHour) xml += `chargeMinimumHour="true" `;
            xml += `/>\n`;
          });
          xml += '          </Periods>\n';
        }

        // Parts
        if (session.parts && session.parts.length > 0) {
          xml += '          <Parts>\n';
          session.parts.forEach(part => {
            xml += `            <Part `;
            xml += `name="${escapeXML(part.name)}" `;
            xml += `quantity="${escapeXML(part.quantity)}" `;
            xml += `price="${escapeXML(part.price)}" `;
            if (part.description) xml += `description="${escapeXML(part.description)}" `;
            if (part.providedByClient) xml += `providedByClient="true" `;
            xml += `/>\n`;
          });
          xml += '          </Parts>\n';
        }

        // Photos
        if (session.photos && session.photos.length > 0) {
          xml += '          <Photos>\n';
          session.photos.forEach(photo => {
            xml += `            <Photo `;
            xml += `id="${escapeXML(photo.id)}" `;
            if (photo.filePath) xml += `filePath="${escapeXML(photo.filePath)}" `;
            if (photo.cloudUrl) xml += `cloudUrl="${escapeXML(photo.cloudUrl)}" `;
            xml += `capturedAt="${formatDate(photo.capturedAt)}" `;
            xml += `sessionNumber="${escapeXML(photo.sessionNumber)}" `;
            xml += `/>\n`;
          });
          xml += '          </Photos>\n';
        }

        xml += '        </Session>\n';
      });
      xml += '      </Sessions>\n';
    }

    xml += '    </Task>\n';
  });
  xml += '  </Tasks>\n';

  // Settings
  xml += '  <Settings ';
  xml += `defaultHourlyRate="${escapeXML(data.settings.defaultHourlyRate)}" `;
  if (data.settings.defaultCloningRate != null) xml += `defaultCloningRate="${escapeXML(data.settings.defaultCloningRate)}" `;
  if (data.settings.defaultProgrammingRate != null) xml += `defaultProgrammingRate="${escapeXML(data.settings.defaultProgrammingRate)}" `;
  if (data.settings.defaultAddKeyRate != null) xml += `defaultAddKeyRate="${escapeXML(data.settings.defaultAddKeyRate)}" `;
  if (data.settings.defaultAllKeysLostRate != null) xml += `defaultAllKeysLostRate="${escapeXML(data.settings.defaultAllKeysLostRate)}" `;
  if (data.settings.googleApiKey) xml += `googleApiKey="${escapeXML(data.settings.googleApiKey)}" `;
  if (data.settings.paymentLink) xml += `paymentLink="${escapeXML(data.settings.paymentLink)}" `;
  if (data.settings.paymentLabel) xml += `paymentLabel="${escapeXML(data.settings.paymentLabel)}" `;
  xml += '/>\n';

  xml += '</AutoTimeData>';
  return xml;
};

export const downloadXML = (xmlString: string, filename: string): void => {
  const blob = new Blob([xmlString], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Parse XML from string
export const parseXMLString = (xmlText: string): DatabaseExport => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Check for XML parsing errors (malformed/corrupted XML)
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid XML format: The file appears to be corrupted or is not valid XML');
  }

  // Check for expected root element
  const root = xmlDoc.documentElement;
  if (!root || root.tagName !== 'AutoTimeData') {
    throw new Error('Invalid backup file: This does not appear to be an AutoTime backup');
  }

  const data: DatabaseExport = {
    clients: [],
    vehicles: [],
    tasks: [],
    settings: { defaultHourlyRate: 75 },
    exportDate: root.getAttribute('exportDate') || new Date().toISOString(),
    version: root.getAttribute('version') || '1.0',
  };

  // Parse Clients
  const clientsNode = root.querySelector('Clients');
  if (clientsNode) {
    clientsNode.querySelectorAll('Client').forEach(node => {
      data.clients.push({
        id: node.getAttribute('id') || '',
        name: node.getAttribute('name') || '',
        email: node.getAttribute('email') || undefined,
        phone: node.getAttribute('phone') || undefined,
        address: node.getAttribute('address') || undefined,
        city: node.getAttribute('city') || undefined,
        state: node.getAttribute('state') || undefined,
        zip: node.getAttribute('zip') || undefined,
        companyName: node.getAttribute('companyName') || undefined,
        itin: node.getAttribute('itin') || undefined,
        notes: node.getAttribute('notes') || undefined,
        hourlyRate: node.getAttribute('hourlyRate') ? parseFloat(node.getAttribute('hourlyRate')!) : undefined,
        cloningRate: node.getAttribute('cloningRate') ? parseFloat(node.getAttribute('cloningRate')!) : undefined,
        programmingRate: node.getAttribute('programmingRate') ? parseFloat(node.getAttribute('programmingRate')!) : undefined,
        addKeyRate: node.getAttribute('addKeyRate') ? parseFloat(node.getAttribute('addKeyRate')!) : undefined,
        allKeysLostRate: node.getAttribute('allKeysLostRate') ? parseFloat(node.getAttribute('allKeysLostRate')!) : undefined,
        accessCode: node.getAttribute('accessCode') || undefined,
        portalId: node.getAttribute('portalId') || undefined,
        prepaidAmount: node.getAttribute('prepaidAmount') ? parseFloat(node.getAttribute('prepaidAmount')!) : undefined,
        createdAt: new Date(node.getAttribute('createdAt') || ''),
      });
    });
  }

  // Parse Vehicles
  const vehiclesNode = root.querySelector('Vehicles');
  if (vehiclesNode) {
    vehiclesNode.querySelectorAll('Vehicle').forEach(node => {
      data.vehicles.push({
        id: node.getAttribute('id') || '',
        clientId: node.getAttribute('clientId') || '',
        vin: node.getAttribute('vin') || '',
        make: node.getAttribute('make') || undefined,
        model: node.getAttribute('model') || undefined,
        year: node.getAttribute('year') ? parseInt(node.getAttribute('year')!) : undefined,
        color: node.getAttribute('color') || undefined,
        prepaidAmount: node.getAttribute('prepaidAmount') ? parseFloat(node.getAttribute('prepaidAmount')!) : undefined,
        diagnosticPdfUrl: node.getAttribute('diagnosticPdfUrl') || undefined,
      });
    });
  }

  // Parse Tasks
  const tasksNode = root.querySelector('Tasks');
  if (tasksNode) {
    tasksNode.querySelectorAll('Task').forEach(taskNode => {
      const task: any = {
        id: taskNode.getAttribute('id') || '',
        clientId: taskNode.getAttribute('clientId') || '',
        vehicleId: taskNode.getAttribute('vehicleId') || '',
        customerName: taskNode.getAttribute('customerName') || '',
        carVin: taskNode.getAttribute('carVin') || '',
        status: taskNode.getAttribute('status') || 'pending',
        totalTime: parseInt(taskNode.getAttribute('totalTime') || '0'),
        needsFollowUp: taskNode.getAttribute('needsFollowUp') === 'true',
        createdAt: new Date(taskNode.getAttribute('createdAt') || ''),
        sessions: [],
      };

      if (taskNode.getAttribute('startTime')) {
        task.startTime = new Date(taskNode.getAttribute('startTime')!);
      }
      if (taskNode.getAttribute('activeSessionId')) {
        task.activeSessionId = taskNode.getAttribute('activeSessionId')!;
      }

      // Parse Sessions
      const sessionsNode = taskNode.querySelector('Sessions');
      if (sessionsNode) {
        sessionsNode.querySelectorAll('Session').forEach(sessionNode => {
          const session: any = {
            id: sessionNode.getAttribute('id') || '',
            createdAt: new Date(sessionNode.getAttribute('createdAt') || ''),
            periods: [],
            parts: [],
          };

          if (sessionNode.getAttribute('completedAt')) {
            session.completedAt = new Date(sessionNode.getAttribute('completedAt')!);
          }
          if (sessionNode.getAttribute('description')) {
            session.description = sessionNode.getAttribute('description')!;
          }
          if (sessionNode.getAttribute('chargeMinimumHour') === 'true') session.chargeMinimumHour = true;
          if (sessionNode.getAttribute('isCloning') === 'true') session.isCloning = true;
          if (sessionNode.getAttribute('isProgramming') === 'true') session.isProgramming = true;
          if (sessionNode.getAttribute('isAddKey') === 'true') session.isAddKey = true;
          if (sessionNode.getAttribute('isAllKeysLost') === 'true') session.isAllKeysLost = true;

          // Parse Periods
          const periodsNode = sessionNode.querySelector('Periods');
          if (periodsNode) {
            periodsNode.querySelectorAll('Period').forEach(periodNode => {
              session.periods.push({
                id: periodNode.getAttribute('id') || '',
                startTime: new Date(periodNode.getAttribute('startTime') || ''),
                endTime: new Date(periodNode.getAttribute('endTime') || ''),
                duration: parseInt(periodNode.getAttribute('duration') || '0'),
                chargeMinimumHour: periodNode.getAttribute('chargeMinimumHour') === 'true' || undefined,
              });
            });
          }

          // Parse Parts
          const partsNode = sessionNode.querySelector('Parts');
          if (partsNode) {
            partsNode.querySelectorAll('Part').forEach(partNode => {
              session.parts.push({
                name: partNode.getAttribute('name') || '',
                quantity: parseFloat(partNode.getAttribute('quantity') || '1'),
                price: parseFloat(partNode.getAttribute('price') || '0'),
                description: partNode.getAttribute('description') || undefined,
                providedByClient: partNode.getAttribute('providedByClient') === 'true' || undefined,
              });
            });
          }

          // Parse Photos
          const photosNode = sessionNode.querySelector('Photos');
          if (photosNode) {
            session.photos = [];
            photosNode.querySelectorAll('Photo').forEach(photoNode => {
              session.photos.push({
                id: photoNode.getAttribute('id') || '',
                filePath: photoNode.getAttribute('filePath') || undefined,
                cloudUrl: photoNode.getAttribute('cloudUrl') || undefined,
                capturedAt: new Date(photoNode.getAttribute('capturedAt') || ''),
                sessionNumber: parseInt(photoNode.getAttribute('sessionNumber') || '1'),
              });
            });
          }

          task.sessions.push(session);
        });
      }

      data.tasks.push(task);
    });
  }

  // Parse Settings
  const settingsNode = root.querySelector('Settings');
  if (settingsNode) {
    data.settings = {
      defaultHourlyRate: parseFloat(settingsNode.getAttribute('defaultHourlyRate') || '75'),
      ...(settingsNode.getAttribute('defaultCloningRate') ? { defaultCloningRate: parseFloat(settingsNode.getAttribute('defaultCloningRate')!) } : {}),
      ...(settingsNode.getAttribute('defaultProgrammingRate') ? { defaultProgrammingRate: parseFloat(settingsNode.getAttribute('defaultProgrammingRate')!) } : {}),
      ...(settingsNode.getAttribute('defaultAddKeyRate') ? { defaultAddKeyRate: parseFloat(settingsNode.getAttribute('defaultAddKeyRate')!) } : {}),
      ...(settingsNode.getAttribute('defaultAllKeysLostRate') ? { defaultAllKeysLostRate: parseFloat(settingsNode.getAttribute('defaultAllKeysLostRate')!) } : {}),
      ...(settingsNode.getAttribute('googleApiKey') ? { googleApiKey: settingsNode.getAttribute('googleApiKey')! } : {}),
      ...(settingsNode.getAttribute('paymentLink') ? { paymentLink: settingsNode.getAttribute('paymentLink')! } : {}),
      ...(settingsNode.getAttribute('paymentLabel') ? { paymentLabel: settingsNode.getAttribute('paymentLabel')! } : {}),
    };
  }

  return data;
};

export const parseXMLFile = (file: File): Promise<DatabaseExport> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const xmlText = e.target?.result as string;
        const data = parseXMLString(xmlText);
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const validateXMLData = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.clients)) return false;
  if (!Array.isArray(data.vehicles)) return false;
  if (!Array.isArray(data.tasks)) return false;
  if (!data.settings || typeof data.settings.defaultHourlyRate !== 'number') return false;
  return true;
};
