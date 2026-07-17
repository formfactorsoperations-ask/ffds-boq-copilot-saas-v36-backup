export const ACTIVITY_WHITELIST = [
    { pattern: /payment received/i, template: "Milestone payment received — with thanks" },
    { pattern: /drawing approved/i, template: "Drawing approved" },
    { pattern: /authorized for addition/i, template: "Work authorized for scope addition" },
    { pattern: /invoice generated/i, template: "Milestone invoice raised" }, 
    { pattern: /design phase formally closed/i, template: "Design phase closed" },
    { pattern: /proposed supplementary invoice/i, template: "Supplementary invoice proposed" }
];

export const PROGRESS_COVERAGE_TEMPLATE = "{X} of {Y} rooms covered";
export const UNCLASSIFIED_REVISION_ASSURANCE = "Being categorised — none chargeable without your confirmation.";
