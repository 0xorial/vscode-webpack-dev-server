export interface SourcePosition {
    line?: number;
    column?: number;
    index?: number;
}

export interface RealDependecyLocation {
    start: SourcePosition;
    end: SourcePosition;
    index: number;
}

export interface SynteticDependencyLocation {
    name?: string;
    index?: number;
}

export type DependencyLocation =
    | RealDependecyLocation
    | SynteticDependencyLocation;


export function formatPosition(pos: SourcePosition) {
    if (pos === null) {
        return "";
    }
    // TODO webpack 5: Simplify this
    if (typeof pos === "string") {
        return pos;
    }
    if (typeof pos === "number") {
        return `${pos}`;
    }
    if (typeof pos === "object") {
        if ("line" in pos && "column" in pos) {
            return `${pos.line}:${pos.column}`;
        } else if ("line" in pos) {
            return `${pos.line}:?`;
        } else if ("index" in pos) {
            // TODO webpack 5 remove this case
            return `+${pos.index}`;
        } else {
            return "";
        }
    }
    return "";
}


export function formatLocation(
    loc: DependencyLocation | SourcePosition | string
) {
    if (loc === null) {
        return "";
    }
    // TODO webpack 5: Simplify this
    if (typeof loc === "string") {
        return loc;
    }
    if (typeof loc === "number") {
        return `${loc}`;
    }
    if (typeof loc === "object") {
        if ("start" in loc && loc.start && "end" in loc && loc.end) {
            if (
                typeof loc.start === "object" &&
                typeof loc.start.line === "number" &&
                typeof loc.end === "object" &&
                typeof loc.end.line === "number" &&
                typeof loc.end.column === "number" &&
                loc.start.line === loc.end.line
            ) {
                return `${formatPosition(loc.start)}-${loc.end.column}`;
            } else {
                return `${formatPosition(loc.start)}-${formatPosition(
                    loc.end
                )}`;
            }
        }
        if ("start" in loc && loc.start) {
            return formatPosition(loc.start);
        }
        if ("name" in loc && "index" in loc) {
            return `${loc.name}[${loc.index}]`;
        }
        if ("name" in loc) {
            return loc.name;
        }
        return formatPosition(loc);
    }
    return "";
}
