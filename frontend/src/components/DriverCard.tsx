import type {
  Driver
} from "../data/drivers";


interface DriverCardProps {
  driver: Driver;
  eliminated: boolean;
  onToggle: () => void;
}


function DriverCard({
  driver,
  eliminated,
  onToggle,
}: DriverCardProps) {
  return (
    <button
      className={
        `driver-card ${
          eliminated
            ? "eliminated"
            : ""
        }`
      }
      onClick={onToggle}
    >
      <span className="driver-number">
        {driver.number}
      </span>

      <div className="driver-picture">
        {driver.name
          .split(" ")
          .map((word) => word[0])
          .join("")}
      </div>

      <h2>
        {driver.name}
      </h2>

      <p>
        {driver.team}
      </p>

      <span className="nationality">
        {driver.nationality}
      </span>

      {eliminated && (
        <div className="eliminated-label">
          ELIMINATED
        </div>
      )}
    </button>
  );
}


export default DriverCard;