import { Logger, Messages } from '@salesforce/core';
import { AsyncCreatable } from '@salesforce/kit';
import { uxEvents } from '../ScannerEvents';


Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/sfdx-scanner', 'EventKeyTemplates');

export type PmdCatalogEvent = {
    key: string;
    args: string[];
    type: string;
    log: string;
    handler: string;
    verbose: boolean;
    time: number;
};

/**
 * Helps with processing output from PmdCatalog java module and converting messages into usable events
 */
export class OutputProcessor extends AsyncCreatable {

    private logger!: Logger;
    private messageLogger!: Logger;

    protected async init(): Promise<void> {
        this.logger = await Logger.child('OutputProcessor');
        this.messageLogger = await Logger.child('MessageLog');
    }

    // We want to find any events that were dumped into stdout or stderr and turn them back into events that can be thrown.
    // As per the convention outlined in SfdxMessager.java, SFDX-relevant messages will be stored in the outputs as JSONs
    // sandwiched between 'SFDX-START' and 'SFDX-END'. So we'll find all instances of that.
    public processOutput(stdout: string, stderr: string): void {
        this.logger.trace(`stdout: ${stdout}`);
        this.logger.trace(`stderr: ${stderr}`);

        const outEvents: PmdCatalogEvent[] = this.getEventsFromString(stdout);
        // TODO: After code streamlining, Main.java prints all messages at once to stdout. Consider removing stderr processing
        const errEvents: PmdCatalogEvent[] = this.getEventsFromString(stderr);
        this.logger.trace(`Total count of events found: stdout - ${outEvents.length}, stderr - ${errEvents.length}`);

        this.orderAndEmitEvents(outEvents, errEvents);
    }

    // TODO: consider moving all message creation logic to a separate place and making this method private
    public orderAndEmitEvents(outEvents: PmdCatalogEvent[], errEvents: PmdCatalogEvent[]): void {
        this.logger.trace('About to order and emit');
        // If both lists are empty, we can just be done now.
        if (outEvents.length == 0 && errEvents.length == 0) {
            return;
        }

        // If either list is non-empty, we'll need to interleave the events in both lists into a single list that's ordered
        // chronologically. We'll do that with a bog-standard merge algorithm.
        const orderedEvents = this.orderEventsChronologically(outEvents, errEvents);

        // Iterate over all of the events and throw them as appropriate.
        orderedEvents.forEach((event) => {
            if (event.handler === 'UX') {
                const eventType = `${event.type.toLowerCase()}-${event.verbose ? 'verbose' : 'always'}`;
                this.logger.trace(`Sending new event of type ${eventType} and message ${event.key}`);
                this.logEvent(event);
                uxEvents.emit(eventType, messages.getMessage(event.key, event.args));
            }
        });
    }


    private getEventsFromString(str: string): PmdCatalogEvent[] {
        const events: PmdCatalogEvent[] = [];

        const regex = /SFDX-START(.*)SFDX-END/g;
        const headerLength = 'SFDX-START'.length;
        const tailLength = 'SFDX-END'.length;
        const regexMatch = str.match(regex);
        if (!regexMatch || regexMatch.length < 1) {
            this.logger.trace(`No events to log`);
        } else {
            regexMatch.forEach(item => {
                const jsonStr = item.substring(headerLength, item.length - tailLength);
                events.push(...JSON.parse(jsonStr));
            });
        }
        return events;
    }

    // TODO: This may no longer be needed since no messages will be printed to stderr. Consider removing this logic
    private orderEventsChronologically(outEvents: PmdCatalogEvent[], errEvents: PmdCatalogEvent[]): PmdCatalogEvent[] {
        let orderedEvents = [];
        let outIdx = 0;
        let errIdx = 0;
        while (outIdx < outEvents.length && errIdx < errEvents.length) {
            if (outEvents[outIdx].time <= errEvents[errIdx].time) {
                orderedEvents.push(outEvents[outIdx++]);
            }
            else {
                orderedEvents.push(errEvents[errIdx++]);
            }
        }
        orderedEvents = orderedEvents.concat(outEvents.slice(outIdx)).concat(errEvents.slice(errIdx));
        return orderedEvents;
    }

    private logEvent(event: PmdCatalogEvent): void {
        const message = `Event: key = ${event.key}, args = ${event.args}, type = ${event.type}, handler = ${event.handler}, verbose = ${event.verbose}, time = ${event.time}, log = ${event.log}`;
        this.messageLogger.info(message);
    }
}